import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertThreadSchema, 
  insertThreadNodeSchema, 
  insertThreadEdgeSchema, 
  insertDocumentSchema,
  insertKnowledgeLinkSchema,
  insertStewardSuggestionSchema,
  insertResearchSessionSchema,
  insertResearchMessageSchema,
  insertMunicipalitySettingsSchema,
  insertAgendaSubmissionSchema,
  insertProjectKnowledgeConfigSchema,
  insertStyleTemplateSchema,
  applyThreadStructurePatchSchema
} from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";
import { 
  generateSuggestions, 
  buildIdealThreadPlan, 
  answerResearchQuestionStream,
  getRequiredNodeTypes,
  retrieveSourceChunksForThread,
  parseClaudeCitations,
  type ThreadContext
} from "./steward/brain";
import { formatChunksForPrompt } from "./rag/retrieval";
import { CITATION_SYSTEM_PROMPT } from "./rag/citations";
import { setupAuth, registerAuthRoutes, isAuthenticated, requireRole } from "./auth";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { getLinearClient } from "./linear-client";
import { streamSummaryResponse } from "./summary-agent";
import { validateThreadStructurePatch } from "./thread-structure";
import { getOpenAI, userVisibleOpenAIRouteError } from "./openai-client";
import { registerGoogleDriveOAuthRoutes, warnIfGoogleDriveUnconfigured } from "./google-drive-oauth";
import multer from "multer";
import {
  extractPdfText,
  transcribeAudio,
  transcribeVideo,
  saveUploadedFile,
  getMediaType,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE
} from "./document-processor";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. OpenAI-powered routes will fail until it is set.");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  warnIfGoogleDriveUnconfigured();
  registerGoogleDriveOAuthRoutes(app);

  app.use("/api/threads", isAuthenticated);
  app.use("/api/nodes", isAuthenticated);
  app.use("/api/edges", isAuthenticated);
  app.use("/api/documents", isAuthenticated);
  app.use("/api/knowledge-links", isAuthenticated);
  app.use("/api/ai", isAuthenticated);
  app.use("/api/research", isAuthenticated);
  app.use("/api/steward", isAuthenticated);
  app.use("/api/linear", isAuthenticated);

  app.use("/api/users", requireRole("ADMIN"));
  app.use("/api/linear", requireRole("ADMIN"));

  // --- RBAC per-route guards ---
  // Admin-only: user management, data source management, project assignment
  // (api/users and api/linear already guarded above via app.use)

  // Threads API (read = all roles, create/delete = PM+ADMIN)
  app.get("/api/threads", async (req, res) => {
    try {
      const threads = await storage.getThreads();
      res.json(threads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  });

  app.get("/api/threads/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const thread = await storage.getThread(id);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      res.json(thread);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch thread" });
    }
  });

  app.post("/api/threads", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertThreadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const thread = await storage.createThread(parsed.data);
      res.status(201).json(thread);
    } catch (error) {
      res.status(500).json({ error: "Failed to create thread" });
    }
  });

  app.patch("/api/threads/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const thread = await storage.updateThread(id, req.body);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      res.json(thread);
    } catch (error) {
      res.status(500).json({ error: "Failed to update thread" });
    }
  });

  app.post("/api/threads/:id/close", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const thread = await storage.getThread(id);
      if (!thread) return res.status(404).json({ error: "Thread not found" });
      if (thread.status === "Closed") return res.status(400).json({ error: "Thread is already closed" });
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only an admin can close a thread" });
      }

      const nodes = await storage.getThreadNodes(id);
      const contentParts: string[] = [];
      for (const node of nodes) {
        const nodeData = node.data as any;
        const nodeContent = nodeData?.content || "";
        if (nodeContent.trim()) {
          contentParts.push(`## ${node.label || node.type}\n\n${nodeContent}`);
        }
      }
      const compiledContent = contentParts.join("\n\n---\n\n");

      if (compiledContent.trim()) {
        await storage.createDocument({
          title: `[Closed Thread] ${thread.title}`,
          type: "thread_archive",
          category: thread.type || "Other",
          content: compiledContent,
          description: `Archived from closed thread: ${thread.title}. Type: ${thread.type}.`,
          tags: ["thread-archive", thread.type?.toLowerCase() || "general"],
          year: new Date().getFullYear(),
          indexed: true,
          isActive: true,
        });
      }

      const updated = await storage.updateThread(id, { status: "Closed" });
      res.json({ thread: updated, archived: !!compiledContent.trim() });
    } catch (error: any) {
      console.error("Error closing thread:", error);
      res.status(500).json({ error: "Failed to close thread" });
    }
  });

  app.delete("/api/threads/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteThread(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete thread" });
    }
  });

  // Thread Synthesis (merge) API
  app.post("/api/threads/merge", isAuthenticated, async (req, res) => {
    try {
      const { threadIds, outputTitle, outputFormat } = req.body;
      if (!Array.isArray(threadIds) || threadIds.length < 2) {
        return res.status(400).json({ error: "At least 2 threads are required" });
      }
      if (!outputTitle || typeof outputTitle !== "string" || !outputTitle.trim()) {
        return res.status(400).json({ error: "Output title is required" });
      }
      if (!outputFormat || typeof outputFormat !== "string") {
        return res.status(400).json({ error: "Output format is required" });
      }

      const uniqueIds = Array.from(new Set(threadIds.map((id: any) => Number(id)))).filter(id => Number.isInteger(id) && id > 0);
      if (uniqueIds.length < 2) {
        return res.status(400).json({ error: "At least 2 unique valid thread IDs are required" });
      }

      const fetchedThreads = await Promise.all(
        uniqueIds.map((id: number) => storage.getThread(id))
      );
      const validThreads = fetchedThreads.filter(Boolean) as NonNullable<typeof fetchedThreads[number]>[];
      if (validThreads.length !== uniqueIds.length) {
        return res.status(404).json({ error: "One or more threads not found" });
      }

      let authorEmail = "system";
      if (req.session?.userId) {
        const [currentUser] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, req.session.userId));
        if (currentUser) authorEmail = currentUser.email;
      }

      const { chunks: ragChunks, sourcesMap } = await retrieveSourceChunksForThread();
      const ragContext = formatChunksForPrompt(ragChunks);

      const contextBlocks: string[] = [];
      for (const thread of validThreads) {
        const parts: string[] = [`## Thread: "${thread.title}"`];
        if (thread.type) parts.push(`Type: ${thread.type}`);
        if (thread.status) parts.push(`Status: ${thread.status}`);
        if (thread.description) parts.push(`Description: ${thread.description}`);
        if (thread.outcome) parts.push(`Outcome: ${thread.outcome}`);

        const nodes = await storage.getThreadNodes(thread.id);
        const activeNodes = nodes.filter(n => !n.deleted);
        for (const node of activeNodes) {
          const content = (node.data as any)?.content;
          if (content) {
            parts.push(`\n### ${node.type.charAt(0).toUpperCase() + node.type.slice(1)}: ${node.label}`);
            parts.push(content.slice(0, 4000));
          }
        }

        const sessions = await storage.getResearchSessions(thread.id);
        for (const session of sessions) {
          const messages = await storage.getResearchMessages(session.id);
          const assistantMessages = messages.filter(m => m.role === "assistant");
          if (assistantMessages.length > 0) {
            parts.push(`\n### Research Findings`);
            for (const msg of assistantMessages.slice(0, 5)) {
              parts.push(msg.content.slice(0, 2000));
            }
          }
        }

        contextBlocks.push(parts.join("\n"));
      }

      const formatPrompts: Record<string, string> = {
        "Unified Memo": `Synthesize the following research threads into a single cohesive municipal policy memo with the following sections:
- **Executive Summary**: A concise overview of the combined findings
- **Key Findings**: The most important insights drawn from all threads
- **Recommended Actions**: Specific, actionable recommendations based on the research
- **Open Questions**: Unresolved issues that need further investigation

Write in a professional municipal government tone. Be thorough but concise.`,

        "Strategy Brief": `Synthesize the following research threads into a concise strategic brief with the following sections:
- **Situation**: Current state and context based on the research
- **Objective**: What needs to be achieved
- **Key Insights**: Critical findings from the combined research
- **Proposed Strategy**: A clear strategy recommendation with rationale

Write in a direct, executive-briefing style appropriate for senior municipal leadership.`,

        "Action Plan": `Synthesize the following research threads into a prioritized action plan with:
- **Overview**: Brief summary of the situation and goals
- **Action Items**: Numbered, prioritized steps. For each step include:
  - Description of the action
  - Owner: [To be assigned]
  - Deadline: [To be determined]
  - Priority: High/Medium/Low
  - Dependencies or prerequisites
- **Success Metrics**: How to measure completion
- **Risks and Mitigations**: Potential obstacles and how to address them

Write in a clear, operational style suitable for project management.`,
      };

      const systemPrompt = formatPrompts[outputFormat] || formatPrompts["Unified Memo"];
      const userPrompt = `Title: "${outputTitle.trim()}"\n\n---\n\n${contextBlocks.join("\n\n---\n\n")}${ragContext}`;

      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: `You are a senior municipal policy analyst. ${systemPrompt}\n\n${CITATION_SYSTEM_PROMPT}`,
        messages: [
          { role: "user", content: userPrompt },
        ],
      });

      const firstBlock = message.content[0];
      const rawContent = firstBlock?.type === "text" ? firstBlock.text : "Synthesis could not be generated.";

      const { annotatedText, citations } = parseClaudeCitations(rawContent, sourcesMap);

      const synthDoc = await storage.createSynthesizedDocument({
        title: outputTitle.trim(),
        format: outputFormat,
        content: annotatedText,
        sourceThreadIds: uniqueIds,
        author: authorEmail,
        citations,
      });

      const newThread = await storage.createThread({
        title: outputTitle.trim(),
        type: outputFormat,
        status: "Drafting",
        author: authorEmail,
        description: `Synthesized from ${validThreads.length} threads: ${validThreads.map(t => t.title).join(", ")}`,
      });

      await storage.createThreadNode({
        threadId: newThread.id,
        type: "draft",
        label: outputTitle.trim(),
        data: { content: annotatedText },
        positionX: 300,
        positionY: 200,
        deleted: false,
      });

      res.json({
        id: newThread.id,
        title: newThread.title,
        synthesizedDocumentId: synthDoc.id,
        sourceThreads: validThreads.map(t => ({ id: t.id, title: t.title })),
        format: outputFormat,
        status: "complete",
      });
    } catch (error) {
      console.error("Thread merge error:", error);
      res.status(500).json({ error: "Failed to merge threads" });
    }
  });

  app.get("/api/synthesized-documents", isAuthenticated, async (_req, res) => {
    try {
      const docs = await storage.getSynthesizedDocuments();
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch synthesized documents" });
    }
  });

  app.get("/api/synthesized-documents/:id", isAuthenticated, async (req, res) => {
    try {
      const doc = await storage.getSynthesizedDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ error: "Document not found" });
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch synthesized document" });
    }
  });

  // Thread Nodes API
  app.get("/api/threads/:threadId/nodes", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const nodes = await storage.getThreadNodes(threadId);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nodes" });
    }
  });

  app.post("/api/threads/:threadId/nodes", isAuthenticated, async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (thread?.status === "Closed") {
        return res.status(403).json({ error: "Cannot add nodes to a closed thread" });
      }
      const parsed = insertThreadNodeSchema.safeParse({ ...req.body, threadId });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const node = await storage.createThreadNode(parsed.data);
      res.status(201).json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  app.patch("/api/nodes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = req.params.id;
      const existingNode = await storage.getThreadNodeById(id);
      if (!existingNode) {
        return res.status(404).json({ error: "Node not found" });
      }
      const thread = await storage.getThread(existingNode.threadId);
      if (thread?.status === "Closed") {
        return res.status(403).json({ error: "Cannot modify nodes in a closed thread" });
      }
      const node = await storage.updateThreadNode(id, req.body);
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/nodes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteThreadNode(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  // Thread Edges API
  app.get("/api/threads/:threadId/edges", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const edges = await storage.getThreadEdges(threadId);
      res.json(edges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  app.post("/api/threads/:threadId/edges", isAuthenticated, async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const parsed = insertThreadEdgeSchema.safeParse({ ...req.body, threadId });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const edge = await storage.createThreadEdge(parsed.data);
      res.status(201).json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to create edge" });
    }
  });

  app.delete("/api/edges/:id", isAuthenticated, async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteThreadEdge(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete edge" });
    }
  });

  app.get("/api/threads/:threadId/thread-structure", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      const snapshot = await storage.getThreadStructureSnapshot(threadId);
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch thread structure snapshot" });
    }
  });

  app.post("/api/threads/:threadId/thread-structure/apply", isAuthenticated, async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }
      if (thread.status === "Closed") {
        return res.status(403).json({ error: "Cannot modify a closed thread" });
      }

      const parsed = applyThreadStructurePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }

      const snapshot = await storage.getThreadStructureSnapshot(threadId);
      const validation = validateThreadStructurePatch(snapshot, parsed.data);
      if (!validation.ok) {
        return res.status(422).json({
          code: "THREAD_STRUCTURE_VALIDATION_FAILED",
          errors: validation.errors,
        });
      }

      try {
        const nextSnapshot = await storage.applyThreadStructurePatch(threadId, parsed.data);
        return res.json(nextSnapshot);
      } catch (error: any) {
        if (error?.message === "THREAD_STRUCTURE_VERSION_CONFLICT") {
          return res.status(409).json({
            code: "THREAD_STRUCTURE_VERSION_CONFLICT",
            error: "Patch base version does not match latest thread version",
          });
        }
        throw error;
      }
    } catch (error) {
      console.error("Failed to apply thread structure patch:", error);
      res.status(500).json({ error: "Failed to apply thread structure patch" });
    }
  });

  // Documents API
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const doc = await storage.createDocument(parsed.data);
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.updateDocument(id, req.body);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDocument(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/documents/upload", isAuthenticated, (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: "File too large. Maximum size is 25MB." });
        }
        return res.status(400).json({ error: err.message || "File upload error" });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, mimetype, buffer, size } = req.file;
      const mediaType = getMediaType(mimetype);
      const title = req.body.title || originalname.replace(/\.[^/.]+$/, "");
      const category = req.body.category || "general";
      const description = req.body.description || null;

      const filePath = saveUploadedFile(buffer, originalname);

      const doc = await storage.createDocument({
        title,
        type: mediaType,
        category,
        description,
        indexed: true,
        processingStatus: "processing",
        filePath,
        mediaType: mimetype,
        fileSize: size,
      });

      res.status(201).json(doc);

      (async () => {
        try {
          let result;
          if (mediaType === "pdf") {
            result = await extractPdfText(buffer);
          } else if (mediaType === "audio") {
            result = await transcribeAudio(buffer, originalname);
          } else if (mediaType === "video") {
            result = await transcribeVideo(buffer, originalname);
          } else if (mediaType === "text") {
            result = { success: true, content: buffer.toString("utf-8") };
          } else {
            result = { success: false, error: "Unsupported file type" };
          }

          if (result.success) {
            await storage.updateDocument(doc.id, {
              extractedContent: result.content,
              processingStatus: "completed",
            });
          } else {
            await storage.updateDocument(doc.id, {
              processingStatus: "failed",
            });
          }
        } catch (error) {
          console.error("Processing error:", error);
          await storage.updateDocument(doc.id, {
            processingStatus: "failed",
          });
        }
      })();
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.post("/api/documents/:id/reprocess", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (!doc.filePath) {
        return res.status(400).json({ error: "Document has no file to reprocess" });
      }

      await storage.updateDocument(id, { processingStatus: "processing" });
      res.json({ message: "Reprocessing started" });

      const fs = await import("fs");
      if (!fs.existsSync(doc.filePath)) {
        await storage.updateDocument(id, { processingStatus: "failed" });
        return;
      }

      const buffer = fs.readFileSync(doc.filePath);
      const mediaType = getMediaType(doc.mediaType || "");

      (async () => {
        try {
          let result;
          if (mediaType === "pdf") {
            result = await extractPdfText(buffer);
          } else if (mediaType === "audio") {
            result = await transcribeAudio(buffer, doc.title);
          } else if (mediaType === "video") {
            result = await transcribeVideo(buffer, doc.title);
          } else {
            result = { success: true, content: buffer.toString("utf-8") };
          }

          if (result.success) {
            await storage.updateDocument(id, {
              extractedContent: result.content,
              processingStatus: "completed",
            });
          } else {
            await storage.updateDocument(id, {
              processingStatus: "failed",
            });
          }
        } catch (error) {
          console.error("Reprocessing error:", error);
          await storage.updateDocument(id, { processingStatus: "failed" });
        }
      })();
    } catch (error) {
      res.status(500).json({ error: "Failed to reprocess document" });
    }
  });

  // Knowledge Links API
  app.get("/api/knowledge-links", async (req, res) => {
    try {
      const links = await storage.getKnowledgeLinks();
      res.json(links);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch knowledge links" });
    }
  });

  app.post("/api/knowledge-links", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertKnowledgeLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const link = await storage.createKnowledgeLink(parsed.data);
      res.status(201).json(link);
    } catch (error) {
      res.status(500).json({ error: "Failed to create knowledge link" });
    }
  });

  app.delete("/api/knowledge-links/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteKnowledgeLink(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete knowledge link" });
    }
  });

  // AI Research Chat API
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { message, threadTitle, context } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const systemPrompt = `You are a helpful AI research assistant for municipal government staff. You help with civic processes including ordinances, resolutions, reports, and policy research.

${threadTitle ? `You are currently assisting with research for: "${threadTitle}"` : ''}

Provide helpful, accurate, and concise responses. When referencing documents or policies, be specific about sources. Format your responses in a clear, readable way.`;

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
      ];

      if (context && Array.isArray(context)) {
        for (const msg of context) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      messages.push({ role: "user", content: message });

      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages,
        stream: true,
        max_completion_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI chat:", error);
      const configErr = userVisibleOpenAIRouteError(error);
      const userMsg = configErr ?? "Failed to get AI response";
      const code = configErr ? "OPENAI_NOT_CONFIGURED" : undefined;
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: userMsg, code })}\n\n`);
        res.end();
      } else {
        res.status(configErr ? 503 : 500).json({ error: userMsg, ...(code ? { code } : {}) });
      }
    }
  });

  // AI URL Ingestion API
  app.post("/api/ai/ingest-url", async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Fetch the URL content
      let pageContent = "";
      let pageTitle = "";
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CivicThreads/1.0; +https://civicthreads.app)',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          pageTitle = titleMatch[1].trim();
        }
        
        // Strip HTML tags and get text content (basic extraction)
        pageContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 10000); // Limit content length
          
      } catch (fetchError) {
        return res.status(400).json({ error: "Could not fetch URL content. Please check the URL is accessible." });
      }

      const systemPrompt = `You are an expert at extracting and summarizing web page content for a municipal knowledge base.
Your task is to create a clear, searchable summary of the given web page content.

Guidelines:
- Extract the key information and main points
- Organize content logically with clear headings if appropriate
- Remove any navigation, footer, or irrelevant content
- Keep the summary concise but comprehensive (aim for 500-1000 words)
- Preserve important facts, figures, dates, and policy details
- Format in a way that's easy to search and reference later`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send the title first
      if (pageTitle) {
        res.write(`data: ${JSON.stringify({ title: pageTitle })}\n\n`);
      }

      const stream = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please extract and summarize the key content from this web page:\n\nURL: ${url}\n\nPage Content:\n${pageContent}` },
        ],
        stream: true,
        max_completion_tokens: 2048,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI URL ingestion:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to process URL" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process URL" });
      }
    }
  });

  // AI Writing Assistant API
  app.post("/api/ai/write-assist", async (req, res) => {
    try {
      const { prompt, currentContent, nodeType, threadTitle, context } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const nodeTypeDescriptions: Record<string, string> = {
        draft: "a formal municipal document draft",
        meeting: "meeting minutes or notes",
        decision: "a formal decision record",
        research: "research notes",
      };

      const documentType = nodeTypeDescriptions[nodeType] || "a document";

      const systemPrompt = `You are an expert government writing assistant helping municipal staff write ${documentType}.
${threadTitle ? `The current project is: "${threadTitle}"` : ''}

You are having a conversation with the user to help develop this document. Provide helpful, well-written content they can add to their document.

${currentContent ? `The document currently contains:\n---\n${currentContent}\n---\n` : 'The document is currently empty.'}

Important guidelines:
- Write in a professional, clear, and formal tone appropriate for government documents
- Be specific and factual
- Structure content clearly with headings when appropriate
- Provide complete, ready-to-use content the user can add to their document
- If asked to improve or revise, provide the improved version directly`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const conversationHistory = (context || []).map((msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const stream = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: prompt },
        ],
        stream: true,
        max_completion_tokens: 2048,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in AI write assist:", error);
      const configErr = userVisibleOpenAIRouteError(error);
      const userMsg = configErr ?? "Failed to get AI response";
      const code = configErr ? "OPENAI_NOT_CONFIGURED" : undefined;
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: userMsg, code })}\n\n`);
        res.end();
      } else {
        res.status(configErr ? 503 : 500).json({ error: userMsg, ...(code ? { code } : {}) });
      }
    }
  });

  // Thread Context API (includes health score)
  app.get("/api/threads/:id/context", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const thread = await storage.getThread(id);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const nodes = await storage.getThreadNodes(id);
      const suggestions = await storage.getSuggestions(id);

      const requiredTypes = getRequiredNodeTypes(thread.type);
      const existingTypes = nodes.filter(n => !n.deleted).map(n => n.type);
      const missingItems = requiredTypes.filter(t => !existingTypes.includes(t));
      const completeness = requiredTypes.length > 0 
        ? Math.round(((requiredTypes.length - missingItems.length) / requiredTypes.length) * 100)
        : 100;

      const riskFlags: string[] = [];
      if (missingItems.length > 0) {
        riskFlags.push(`Missing ${missingItems.length} required node type(s)`);
      }
      if (thread.status === "Drafting" && nodes.filter(n => !n.deleted).length === 0) {
        riskFlags.push("Thread has no nodes yet");
      }

      res.json({
        thread,
        nodes: nodes.filter(n => !n.deleted),
        suggestions,
        health: {
          completeness,
          missingItems,
          riskFlags,
        },
      });
    } catch (error) {
      console.error("Error fetching thread context:", error);
      res.status(500).json({ error: "Failed to fetch thread context" });
    }
  });

  // Research Sessions API
  
  // Get existing sessions for a thread
  app.get("/api/research/:threadId/sessions", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const sessions = await storage.getResearchSessions(threadId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching research sessions:", error);
      res.status(500).json({ error: "Failed to fetch research sessions" });
    }
  });

  // Get messages for a session
  app.get("/api/research/:threadId/sessions/:sessionId/messages", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const messages = await storage.getResearchMessages(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching research messages:", error);
      res.status(500).json({ error: "Failed to fetch research messages" });
    }
  });

  // Create or get existing session for a thread
  app.post("/api/research/:threadId/session", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      // Check if there's an existing session for this thread
      const existingSessions = await storage.getResearchSessions(threadId);
      if (existingSessions.length > 0) {
        // Return the most recent session
        const latestSession = existingSessions[0];
        const messages = await storage.getResearchMessages(latestSession.id);
        return res.json({ sessionId: latestSession.id, messages });
      }

      // Create a new session
      const session = await storage.createResearchSession({ threadId });
      res.status(201).json({ sessionId: session.id, messages: [] });
    } catch (error) {
      console.error("Error creating research session:", error);
      res.status(500).json({ error: "Failed to create research session" });
    }
  });

  // Research Messages API (with streaming)
  app.post("/api/research/:threadId/message", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const { sessionId, content, selectedDocumentIds } = req.body;

      if (!sessionId || !content) {
        return res.status(400).json({ error: "sessionId and content are required" });
      }

      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const session = await storage.getResearchSession(sessionId);
      if (!session || session.threadId !== threadId) {
        return res.status(404).json({ error: "Research session not found" });
      }

      await storage.createResearchMessage({
        sessionId,
        role: "user",
        content,
      });

      const nodes = await storage.getThreadNodes(threadId);
      
      // Fetch knowledge base documents for AI context and citations
      const knowledgeBaseDocs = await storage.getDocuments();
      let docsWithContent = knowledgeBaseDocs
        .filter(d => d.processingStatus === "completed" && d.extractedContent)
        .map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          description: d.description,
          extractedContent: d.extractedContent,
          processingStatus: d.processingStatus,
          isSelected: false as boolean,
        }));

      // If user selected specific documents, filter to those and mark them as prioritized
      if (selectedDocumentIds && Array.isArray(selectedDocumentIds) && selectedDocumentIds.length > 0) {
        docsWithContent = docsWithContent
          .filter(d => selectedDocumentIds.includes(d.id))
          .map(d => ({ ...d, isSelected: true }));
      }

      const threadContext: ThreadContext = {
        thread: {
          id: thread.id,
          title: thread.title,
          type: thread.type,
          status: thread.status,
        },
        nodes: nodes.filter(n => !n.deleted).map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
        })),
        knowledgeBaseDocuments: docsWithContent,
        hasSelectedDocuments: selectedDocumentIds && selectedDocumentIds.length > 0,
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await answerResearchQuestionStream(threadContext, content);
      let fullResponse = "";

      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || "";
        if (chunkContent) {
          fullResponse += chunkContent;
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }

      const { chunks: researchChunks, sourcesMap: researchSourcesMap } = await retrieveSourceChunksForThread();
      const { annotatedText: annotatedResponse, citations: researchCitations } = parseClaudeCitations(fullResponse, researchSourcesMap);

      await storage.createResearchMessage({
        sessionId,
        role: "assistant",
        content: annotatedResponse,
        citations: researchCitations.map(c => ({
          sourceId: c.sourceId,
          sourceType: c.sourceType,
          sourceTitle: c.sourceTitle,
          sourcePage: c.sourcePage,
          sourceUrl: c.sourceUrl,
        })),
      });

      res.write(`data: ${JSON.stringify({ done: true, fullResponse: annotatedResponse, citations: researchCitations })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error in research message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process research message" });
      }
    }
  });

  // Generate draft document from research conversation
  app.post("/api/research/:threadId/generate-draft", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const { sessionId, draftType } = req.body;

      if (!sessionId || !draftType) {
        return res.status(400).json({ error: "sessionId and draftType are required" });
      }

      const validDraftTypes = ["Memo", "Decision", "MeetingMinutes", "PermitReview"];
      if (!validDraftTypes.includes(draftType)) {
        return res.status(400).json({ error: "Invalid draft type" });
      }

      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const session = await storage.getResearchSession(sessionId);
      if (!session || session.threadId !== threadId) {
        return res.status(404).json({ error: "Research session not found" });
      }

      // Get all messages from the session
      const messages = await storage.getResearchMessages(sessionId);
      if (messages.length === 0) {
        return res.status(400).json({ error: "No research messages to generate draft from" });
      }

      // Build conversation context
      const conversationText = messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      // Fetch matching style templates for tone/structure guidance
      const typeMapping: Record<string, string> = {
        'Memo': 'Memo',
        'Decision': 'Decision Document',
        'MeetingMinutes': 'Meeting Minutes',
        'PermitReview': 'Permit Review',
      };
      const templateType = typeMapping[draftType] || draftType;
      const matchingTemplates = await storage.getStyleTemplatesByType(templateType);
      
      let styleGuidance = '';
      if (matchingTemplates.length > 0) {
        const templateExamples = matchingTemplates.slice(0, 3).map((t, i) => {
          const text = t.extractedContent || t.content || '';
          return `--- STYLE EXAMPLE ${i + 1}: "${t.name}" ---\n${text.substring(0, 4000)}\n--- END EXAMPLE ${i + 1} ---`;
        }).join('\n\n');
        
        styleGuidance = `\n\nIMPORTANT STYLE GUIDANCE:
The following are example documents from this municipality. You MUST match their tone, voice, formatting style, and structural conventions as closely as possible. Pay attention to:
- How headers and sections are formatted
- The level of formality and language used
- How recommendations and findings are presented
- Document structure and section ordering
- Salutations, signatures, and closing conventions

${templateExamples}

Match the style, tone, and structure of these examples in the document you produce.`;
      }

      // Generate draft using OpenAI
      const systemPrompt = `You are a municipal government document writer. Based on the research conversation provided, generate a professional ${draftType} document.

Thread Context:
- Title: ${thread.title}
- Type: ${thread.type}
- Topic: ${thread.topic || 'N/A'}
- Description: ${thread.description || 'N/A'}

Document Type Guidelines:
${draftType === 'Memo' ? `
Create a formal memo with:
- TO/FROM/DATE/SUBJECT header
- Executive summary
- Background/Context
- Key findings from research
- Recommendations
- Conclusion` : ''}
${draftType === 'Decision' ? `
Create a decision document with:
- Decision summary at the top
- Background and context
- Options considered
- Rationale for the decision
- Implementation steps
- Effective date` : ''}
${draftType === 'MeetingMinutes' ? `
Create meeting minutes with:
- Meeting details (date, attendees, location)
- Agenda items discussed
- Key discussion points from research
- Decisions made
- Action items
- Next steps` : ''}
${draftType === 'PermitReview' ? `
Create a permit review document with:
- Application summary
- Review criteria
- Findings from research
- Compliance assessment
- Conditions (if any)
- Recommendation (approve/deny/conditional)` : ''}
${styleGuidance}

Research Conversation:
${conversationText}

Generate a complete, professional document that synthesizes the research findings. Use markdown formatting with ## for section headers so the document renders well in preview mode.`;

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the document based on the research conversation." }
        ],
        max_completion_tokens: 2000,
      });

      const draftContent = completion.choices[0]?.message?.content || "";
      
      // Get existing nodes to find position for new node
      const existingNodes = await storage.getThreadNodes(threadId);
      const maxY = existingNodes.length > 0 
        ? Math.max(...existingNodes.map(n => n.positionY)) + 150
        : 100;
      const maxX = existingNodes.length > 0
        ? Math.max(...existingNodes.map(n => n.positionX))
        : 250;

      // Create a new node with the draft (use lowercase types to match frontend nodeTypes)
      const nodeType = draftType === 'MeetingMinutes' ? 'meeting' : 
                       draftType === 'PermitReview' ? 'permitReview' : 
                       draftType === 'Decision' ? 'decision' : 'draft';
      
      const newNode = await storage.createThreadNode({
        threadId,
        type: nodeType,
        label: `${draftType}: ${thread.title}`,
        positionX: maxX,
        positionY: maxY,
        deleted: false,
        data: {
          content: draftContent,
          generatedFrom: 'research',
          sessionId: sessionId,
        },
      });

      // Find the research node to connect to (if exists) - check both casing
      const researchNode = existingNodes.find(n => (n.type === 'research' || n.type === 'Research') && !n.deleted);
      let edge = null;
      
      if (researchNode) {
        edge = await storage.createThreadEdge({
          threadId,
          source: researchNode.id,
          target: newNode.id,
          animated: true,
        });
      }

      res.json({
        node: newNode,
        edge,
        draftContent,
      });
    } catch (error) {
      console.error("Error generating draft:", error);
      res.status(500).json({ error: "Failed to generate draft document" });
    }
  });

  // Get Steward Suggestions
  app.get("/api/steward/:threadId/suggestions", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const suggestions = await storage.getSuggestions(threadId);
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // Generate Steward Suggestions
  app.post("/api/steward/:threadId/suggestions/generate", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const nodes = await storage.getThreadNodes(threadId);
      
      // Fetch knowledge base documents for context
      const knowledgeBaseDocs = await storage.getDocuments();
      const docsWithContent = knowledgeBaseDocs
        .filter(d => d.processingStatus === "completed" && d.extractedContent)
        .map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          description: d.description,
          extractedContent: d.extractedContent,
          processingStatus: d.processingStatus,
        }));

      const threadContext: ThreadContext = {
        thread: {
          id: thread.id,
          title: thread.title,
          type: thread.type,
          status: thread.status,
        },
        nodes: nodes.filter(n => !n.deleted).map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
        })),
        knowledgeBaseDocuments: docsWithContent,
      };

      const suggestions = await generateSuggestions(threadContext);

      const savedSuggestions = [];
      for (const suggestion of suggestions) {
        const saved = await storage.createSuggestion({
          threadId,
          type: suggestion.type as any,
          title: suggestion.title,
          rationale: suggestion.rationale,
          actionPayload: suggestion.actionPayload,
          priority: suggestion.priority,
          status: "NEW",
        });
        savedSuggestions.push(saved);
      }

      res.json(savedSuggestions);
    } catch (error) {
      console.error("Error generating suggestions:", error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Generate Ideal Thread Plan
  app.post("/api/steward/:threadId/ideal-thread/plan", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const nodes = await storage.getThreadNodes(threadId);
      
      // Fetch knowledge base documents for context
      const knowledgeBaseDocs = await storage.getDocuments();
      const docsWithContent = knowledgeBaseDocs
        .filter(d => d.processingStatus === "completed" && d.extractedContent)
        .map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          description: d.description,
          extractedContent: d.extractedContent,
          processingStatus: d.processingStatus,
        }));

      const threadContext: ThreadContext = {
        thread: {
          id: thread.id,
          title: thread.title,
          type: thread.type,
          status: thread.status,
        },
        nodes: nodes.filter(n => !n.deleted).map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
        })),
        knowledgeBaseDocuments: docsWithContent,
      };

      const plan = await buildIdealThreadPlan(threadContext);
      res.json(plan);
    } catch (error) {
      console.error("Error building ideal thread plan:", error);
      res.status(500).json({ error: "Failed to build ideal thread plan" });
    }
  });

  // Execute Steward Action
  app.post("/api/steward/:threadId/execute", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
      const { action, payload } = req.body;

      if (!action || !payload) {
        return res.status(400).json({ error: "action and payload are required" });
      }

      const thread = await storage.getThread(threadId);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      let result: any;

      switch (action) {
        case "create_node": {
          const nodeData = {
            threadId,
            type: payload.type,
            label: payload.label,
            positionX: payload.positionX || 100,
            positionY: payload.positionY || 100,
            data: payload.data,
          };
          const parsed = insertThreadNodeSchema.safeParse(nodeData);
          if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.errors });
          }
          result = await storage.createThreadNode(parsed.data);
          break;
        }

        case "accept_suggestion": {
          const { suggestionId, createNode } = payload;
          await storage.updateSuggestion(suggestionId, { status: "ACCEPTED" });
          
          if (createNode) {
            const nodeData = {
              threadId,
              type: createNode.type,
              label: createNode.label,
              positionX: createNode.positionX || 100,
              positionY: createNode.positionY || 100,
              data: createNode.data,
            };
            const parsed = insertThreadNodeSchema.safeParse(nodeData);
            if (parsed.success) {
              result = await storage.createThreadNode(parsed.data);
            }
          } else {
            result = { status: "accepted" };
          }
          break;
        }

        case "create_from_plan":
        case "CREATE_IDEAL_THREAD": {
          const items = req.body.items || payload?.nodes || [];
          const createdNodes = [];
          let yPosition = 100;

          for (const item of items) {
            const nodeType = item.nodeKind?.toLowerCase() || item.kind?.toLowerCase() || 'draft';
            const validTypes = ['research', 'draft', 'decision', 'meeting', 'permitreview'];
            const mappedType = validTypes.includes(nodeType) ? nodeType : 'draft';
            
            const nodeData = {
              threadId,
              type: mappedType,
              label: item.title,
              positionX: 100,
              positionY: yPosition,
              data: { 
                contentOutline: item.contentOutline || item.initialContentOutline,
              },
            };
            const parsed = insertThreadNodeSchema.safeParse(nodeData);
            if (parsed.success) {
              const created = await storage.createThreadNode(parsed.data);
              createdNodes.push(created);
              yPosition += 150;
            }
          }
          result = createdNodes;
          break;
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      res.json(result);
    } catch (error) {
      console.error("Error executing steward action:", error);
      res.status(500).json({ error: "Failed to execute action" });
    }
  });

  // Update Suggestion Status
  app.patch("/api/steward/suggestions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;

      if (!status || !["ACCEPTED", "DISMISSED"].includes(status)) {
        return res.status(400).json({ error: "status must be ACCEPTED or DISMISSED" });
      }

      const updated = await storage.updateSuggestion(id, { status });
      if (!updated) {
        return res.status(404).json({ error: "Suggestion not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating suggestion:", error);
      res.status(500).json({ error: "Failed to update suggestion" });
    }
  });

  // AI Summary Agent for Dashboard
  app.post("/api/ai/summary", async (req, res) => {
    try {
      const { message, history = [] } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "message is required" });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const generator = streamSummaryResponse(message, history);

      for await (const event of generator) {
        if (event.type === 'token') {
          res.write(`data: ${JSON.stringify({ type: 'token', content: event.content })}\n\n`);
        } else if (event.type === 'actions') {
          res.write(`data: ${JSON.stringify({ type: 'actions', actions: event.actions })}\n\n`);
        } else if (event.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        } else if (event.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      console.error("Error in AI summary:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate summary" });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response' })}\n\n`);
        res.end();
      }
    }
  });

  // Admin: User management routes (admin-only via app.use guard above)
  app.get("/api/users", async (_req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          title: users.title,
          position: users.position,
          municipality: users.municipality,
          createdAt: users.createdAt,
        })
        .from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["ADMIN", "PM"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be ADMIN or PM." });
      }
      const [updated] = await db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, req.params.id))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // Linear Integration Routes (admin-only via app.use guard above)
  app.get("/api/linear/teams", async (_req, res) => {
    try {
      const client = await getLinearClient();
      const teams = await client.teams();
      const result = teams.nodes.map(t => ({
        id: t.id,
        name: t.name,
        key: t.key,
      }));
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching Linear teams:", error);
      res.status(500).json({ error: error.message || "Failed to fetch teams" });
    }
  });

  app.get("/api/linear/projects", async (_req, res) => {
    try {
      const client = await getLinearClient();
      const projects = await client.projects();
      const result = projects.nodes.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        state: p.state,
        progress: p.progress,
        startDate: p.startDate,
        targetDate: p.targetDate,
      }));
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching Linear projects:", error);
      res.status(500).json({ error: error.message || "Failed to fetch projects" });
    }
  });

  app.get("/api/linear/issues", async (req, res) => {
    try {
      const client = await getLinearClient();
      const { projectId, teamId, status } = req.query;

      let issues;
      if (projectId) {
        const project = await client.project(projectId as string);
        issues = await project.issues();
      } else if (teamId) {
        const team = await client.team(teamId as string);
        issues = await team.issues();
      } else {
        issues = await client.issues({ first: 50 });
      }

      const result = await Promise.all(
        issues.nodes.map(async (issue) => {
          const state = await issue.state;
          const assignee = await issue.assignee;
          const project = await issue.project;
          return {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            priority: issue.priority,
            priorityLabel: issue.priorityLabel,
            state: state ? { id: state.id, name: state.name, type: state.type, color: state.color } : null,
            assignee: assignee ? { id: assignee.id, name: assignee.name, avatarUrl: assignee.avatarUrl } : null,
            project: project ? { id: project.id, name: project.name } : null,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            url: issue.url,
          };
        })
      );

      if (status) {
        const filtered = result.filter(i => i.state?.type === status);
        res.json(filtered);
      } else {
        res.json(result);
      }
    } catch (error: any) {
      console.error("Error fetching Linear issues:", error);
      res.status(500).json({ error: error.message || "Failed to fetch issues" });
    }
  });

  app.post("/api/linear/issues", async (req, res) => {
    try {
      const client = await getLinearClient();
      const { title, description, teamId, projectId, priority, stateId } = req.body;

      if (!title || !teamId) {
        return res.status(400).json({ error: "Title and teamId are required" });
      }

      const created = await client.createIssue({
        title,
        description,
        teamId,
        projectId,
        priority,
        stateId,
      });

      const issue = await created.issue;
      if (!issue) {
        return res.status(500).json({ error: "Failed to create issue" });
      }

      const state = await issue.state;
      res.status(201).json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: state ? { id: state.id, name: state.name, type: state.type, color: state.color } : null,
        url: issue.url,
      });
    } catch (error: any) {
      console.error("Error creating Linear issue:", error);
      res.status(500).json({ error: error.message || "Failed to create issue" });
    }
  });

  app.patch("/api/linear/issues/:id", async (req, res) => {
    try {
      const client = await getLinearClient();
      const { id } = req.params;
      const { title, description, stateId, priority, assigneeId } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (stateId !== undefined) updateData.stateId = stateId;
      if (priority !== undefined) updateData.priority = priority;
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId;

      await client.updateIssue(id, updateData);

      const issue = await client.issue(id);
      const state = await issue.state;
      const assignee = await issue.assignee;

      res.json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: state ? { id: state.id, name: state.name, type: state.type, color: state.color } : null,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
        url: issue.url,
      });
    } catch (error: any) {
      console.error("Error updating Linear issue:", error);
      res.status(500).json({ error: error.message || "Failed to update issue" });
    }
  });

  app.post("/api/threads/:id/link-linear", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const thread = await storage.getThread(id);
      if (!thread) {
        return res.status(404).json({ error: "Thread not found" });
      }

      const { teamId, projectId } = req.body;
      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }

      const client = await getLinearClient();
      const created = await client.createIssue({
        title: thread.title,
        description: `**Type:** ${thread.type}\n**Topic:** ${thread.topic || ''}\n\n${thread.description || ''}\n\n---\n*Linked from Civic Threads*`,
        teamId,
        projectId: projectId || undefined,
      });

      const issue = await created.issue;
      if (!issue) {
        return res.status(500).json({ error: "Failed to create Linear issue" });
      }

      const updated = await storage.updateThread(id, {
        linearIssueId: issue.id,
        linearIssueUrl: issue.url,
      });

      const state = await issue.state;
      res.json({
        thread: updated,
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
          state: state ? { name: state.name, type: state.type, color: state.color } : null,
        },
      });
    } catch (error: any) {
      console.error("Error linking thread to Linear:", error);
      if (error.type === 'AuthenticationError') {
        res.status(401).json({ error: "Linear authentication failed. Please reconnect Linear in settings." });
      } else {
        res.status(500).json({ error: error.message || "Failed to link thread to Linear" });
      }
    }
  });

  app.delete("/api/threads/:id/link-linear", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateThread(id, {
        linearIssueId: null,
        linearIssueUrl: null,
      });
      if (!updated) {
        return res.status(404).json({ error: "Thread not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error unlinking thread from Linear:", error);
      res.status(500).json({ error: error.message || "Failed to unlink" });
    }
  });

  app.get("/api/linear/issues/:id", async (req, res) => {
    try {
      const client = await getLinearClient();
      const issue = await client.issue(req.params.id);
      const state = await issue.state;
      const assignee = await issue.assignee;
      res.json({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        state: state ? { id: state.id, name: state.name, type: state.type, color: state.color } : null,
        assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
        url: issue.url,
      });
    } catch (error: any) {
      console.error("Error fetching Linear issue:", error);
      res.status(500).json({ error: error.message || "Failed to fetch issue" });
    }
  });

  app.get("/api/linear/states/:teamId", async (req, res) => {
    try {
      const client = await getLinearClient();
      const team = await client.team(req.params.teamId);
      const states = await team.states();
      const result = states.nodes.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        color: s.color,
        position: s.position,
      }));
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching Linear states:", error);
      res.status(500).json({ error: error.message || "Failed to fetch states" });
    }
  });

  // ── Agenda Integration Settings (Admin only) ──
  app.get("/api/settings/agenda", isAuthenticated, requireRole("ADMIN"), async (_req, res) => {
    try {
      const settings = await storage.getMunicipalitySettings();
      res.json(settings || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings/agenda", isAuthenticated, requireRole("ADMIN"), async (req, res) => {
    try {
      const parsed = insertMunicipalitySettingsSchema.parse(req.body);
      const settings = await storage.upsertMunicipalitySettings(parsed);
      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Agenda Submission ──
  app.post("/api/agenda/submit", isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getMunicipalitySettings();
      if (!settings) {
        return res.status(400).json({ error: "Agenda integration not configured. Ask an Admin to set it up." });
      }

      const parsed = insertAgendaSubmissionSchema.parse({
        ...req.body,
        destinationType: settings.agendaDestinationType,
        submittedBy: (req.user as any)?.email || (req.user as any)?.username || "unknown",
      });

      const submission = await storage.createAgendaSubmission(parsed);

      if (settings.agendaDestinationType === "download_pdf") {
        res.json({ submission, action: "download_pdf" });
      } else if (settings.agendaDestinationType === "email") {
        console.log(`[Agenda] Email would be sent to: ${settings.clerkEmail}`, {
          subject: `Agenda Item: ${parsed.documentTitle}`,
          meetingDate: parsed.meetingDate,
          category: parsed.category,
        });
        res.json({ submission, action: "email_sent", clerkEmail: settings.clerkEmail });
      } else if (settings.agendaDestinationType === "granicus") {
        console.log(`[Agenda] Granicus API stub call to: ${settings.granicusEndpointUrl}`, {
          title: parsed.documentTitle,
          meetingDate: parsed.meetingDate,
          category: parsed.category,
        });
        res.json({ submission, action: "granicus_submitted" });
      } else if (settings.agendaDestinationType === "legistar") {
        console.log(`[Agenda] Legistar API stub call to: ${settings.legistarEndpointUrl}`, {
          title: parsed.documentTitle,
          meetingDate: parsed.meetingDate,
          category: parsed.category,
        });
        res.json({ submission, action: "legistar_submitted" });
      } else {
        res.json({ submission, action: "submitted" });
      }
    } catch (error: any) {
      console.error("Error submitting agenda item:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/agenda/submissions", isAuthenticated, async (_req, res) => {
    try {
      const submissions = await storage.getAgendaSubmissions();
      res.json(submissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agenda/categories", isAuthenticated, async (_req, res) => {
    try {
      const settings = await storage.getMunicipalitySettings();
      const categories = settings?.agendaCategories || ["New Business", "Old Business", "Public Hearing", "Consent Agenda"];
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Agenda Builder: Meetings ──
  app.get("/api/agenda/meetings", isAuthenticated, async (_req, res) => {
    try {
      const meetings = await storage.getAgendaMeetings();
      res.json(meetings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agenda/meetings/:id", isAuthenticated, async (req, res) => {
    try {
      const meeting = await storage.getAgendaMeeting(parseInt(req.params.id));
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });
      res.json(meeting);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agenda/meetings", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can create meetings" });
      }
      const { title, meetingDate, location, description } = req.body;
      if (!title || !meetingDate) return res.status(400).json({ error: "Title and meeting date are required" });
      const meeting = await storage.createAgendaMeeting({
        title,
        meetingDate,
        location: location || null,
        description: description || null,
        createdBy: req.session.userId!,
      });
      res.json(meeting);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/agenda/meetings/:id", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can update meetings" });
      }
      const { title, meetingDate, location, description, status } = req.body;
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (meetingDate !== undefined) updates.meetingDate = new Date(meetingDate);
      if (location !== undefined) updates.location = location;
      if (description !== undefined) updates.description = description;
      if (status !== undefined && ["draft", "published", "archived"].includes(status)) updates.status = status;
      const meeting = await storage.updateAgendaMeeting(parseInt(req.params.id), updates);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });
      res.json(meeting);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/agenda/meetings/:id", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can delete meetings" });
      }
      await storage.deleteAgendaMeeting(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Agenda Builder: Items ──
  app.get("/api/agenda/meetings/:meetingId/items", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getAgendaItemsForMeeting(parseInt(req.params.meetingId));
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/agenda/meetings/:meetingId/items", isAuthenticated, async (req, res) => {
    try {
      const meetingId = parseInt(req.params.meetingId);
      const meeting = await storage.getAgendaMeeting(meetingId);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });
      if (meeting.status !== "draft") return res.status(400).json({ error: "Can only add items to draft meetings" });
      const { title, description, category, content, notes, threadId } = req.body;
      if (!title) return res.status(400).json({ error: "Title is required" });
      const existingItems = await storage.getAgendaItemsForMeeting(meetingId);
      const sortOrder = existingItems.length;
      const item = await storage.createAgendaItem({
        title,
        description: description || null,
        category: category || "New Business",
        content: content || null,
        notes: notes || null,
        threadId: threadId || null,
        meetingId,
        sortOrder,
        status: "pending",
        submittedBy: req.session.userId!,
      });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/agenda/items/:id", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can update agenda items" });
      }
      const { status, category, title, description, notes, sortOrder } = req.body;
      const updates: Record<string, any> = {};
      if (status !== undefined && ["pending", "approved", "rejected"].includes(status)) updates.status = status;
      if (category !== undefined) updates.category = category;
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (notes !== undefined) updates.notes = notes;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      const item = await storage.updateAgendaItem(parseInt(req.params.id), updates);
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/agenda/items/:id", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can remove agenda items" });
      }
      await storage.deleteAgendaItem(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/agenda/meetings/:meetingId/reorder", isAuthenticated, async (req, res) => {
    try {
      if (req.session.userRole !== "ADMIN") {
        return res.status(403).json({ error: "Only admins can reorder agenda items" });
      }
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds)) return res.status(400).json({ error: "itemIds must be an array" });
      for (let i = 0; i < itemIds.length; i++) {
        await storage.updateAgendaItem(itemIds[i], { sortOrder: i });
      }
      const items = await storage.getAgendaItemsForMeeting(parseInt(req.params.meetingId));
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Project Knowledge Gating ──
  app.get("/api/projects/:projectId/knowledge-config", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const config = await storage.getProjectKnowledgeConfig(projectId);
      res.json(config || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/projects/:projectId/knowledge-config", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const parsed = insertProjectKnowledgeConfigSchema.parse({ ...req.body, projectId });
      const config = await storage.upsertProjectKnowledgeConfig(parsed);
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/knowledge/stats", isAuthenticated, async (req, res) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      let config = null;
      if (projectId) {
        config = await storage.getProjectKnowledgeConfig(projectId);
      }
      const stats = await storage.getKnowledgeSourceStats(config);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/knowledge/tags", isAuthenticated, async (_req, res) => {
    try {
      const tags = await storage.getAllKnowledgeTags();
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Style Templates ──
  app.get("/api/style-templates", isAuthenticated, async (_req, res) => {
    try {
      const templates = await storage.getStyleTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/style-templates", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertStyleTemplateSchema.parse(req.body);
      const template = await storage.createStyleTemplate(parsed);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/style-templates/upload", isAuthenticated, (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        return res.status(413).json({ error: "File too large" });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { name, documentType, description } = req.body;
      if (!name || !documentType) {
        return res.status(400).json({ error: "name and documentType are required" });
      }

      const fs = await import("fs");
      const path = await import("path");
      const uploadsDir = path.join(process.cwd(), "uploads", "style-templates");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const safeOrigName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${Date.now()}-${safeOrigName}`;
      const filePath = path.join(uploadsDir, fileName);

      const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
      const ext = path.extname(safeOrigName).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: "Unsupported file type. Allowed: PDF, Word, Text, Markdown." });
      }

      fs.writeFileSync(filePath, file.buffer);

      let extractedContent = "";
      const mimeType = file.mimetype || "";
      if (mimeType.includes("text") || ext === ".txt" || ext === ".md") {
        extractedContent = file.buffer.toString("utf-8");
      } else if (mimeType.includes("pdf") || ext === ".pdf") {
        try {
          const { extractPdfText } = await import("./document-processor/index");
          const pdfResult = await extractPdfText(file.buffer);
          extractedContent = pdfResult.success ? (pdfResult.content || "") : "[PDF content - extraction failed]";
        } catch (e) {
          extractedContent = "[PDF content - extraction failed]";
        }
      } else if (ext === ".doc" || ext === ".docx") {
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedContent = result.value || "";
        } catch (e) {
          extractedContent = file.buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
        }
      }

      const template = await storage.createStyleTemplate({
        name,
        documentType,
        description: description || "",
        content: extractedContent || undefined,
        extractedContent: extractedContent || undefined,
        filePath,
        fileSize: file.size,
        mediaType: mimeType,
      });

      res.status(201).json(template);
    } catch (error: any) {
      console.error("Style template upload error:", error);
      res.status(500).json({ error: "Failed to upload style template" });
    }
  });

  app.delete("/api/style-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteStyleTemplate(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
