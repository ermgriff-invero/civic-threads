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
  insertResearchMessageSchema
} from "@shared/schema";
import OpenAI from "openai";
import { 
  generateSuggestions, 
  buildIdealThreadPlan, 
  answerResearchQuestionStream,
  getRequiredNodeTypes,
  type ThreadContext
} from "./steward/brain";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./auth";
import { streamSummaryResponse } from "./summary-agent";
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
  console.warn("WARNING: OPENAI_API_KEY is not set. AI features will not work.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // Apply authentication middleware to all protected API routes
  // This protects all routes except the auth routes (/api/login, /api/callback, /api/logout, /api/auth/user)
  app.use("/api/threads", isAuthenticated);
  app.use("/api/nodes", isAuthenticated);
  app.use("/api/edges", isAuthenticated);
  app.use("/api/documents", isAuthenticated);
  app.use("/api/knowledge-links", isAuthenticated);
  app.use("/api/ai", isAuthenticated);
  app.use("/api/research", isAuthenticated);
  app.use("/api/steward", isAuthenticated);

  // Threads API
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

  app.post("/api/threads", async (req, res) => {
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

  app.patch("/api/threads/:id", async (req, res) => {
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

  app.delete("/api/threads/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteThread(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete thread" });
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

  app.post("/api/threads/:threadId/nodes", async (req, res) => {
    try {
      const threadId = parseInt(req.params.threadId);
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

  app.patch("/api/nodes/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const node = await storage.updateThreadNode(id, req.body);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/nodes/:id", async (req, res) => {
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

  app.post("/api/threads/:threadId/edges", async (req, res) => {
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

  app.delete("/api/edges/:id", async (req, res) => {
    try {
      const id = req.params.id;
      await storage.deleteThreadEdge(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete edge" });
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

  app.post("/api/documents", async (req, res) => {
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

  app.patch("/api/documents/:id", async (req, res) => {
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

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteDocument(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/documents/upload", (req, res, next) => {
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

  app.post("/api/documents/:id/reprocess", async (req, res) => {
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

  app.post("/api/knowledge-links", async (req, res) => {
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

  app.delete("/api/knowledge-links/:id", async (req, res) => {
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

      const stream = await openai.chat.completions.create({
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
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
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

      const stream = await openai.chat.completions.create({
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

      const stream = await openai.chat.completions.create({
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
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get AI response" });
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

      await storage.createResearchMessage({
        sessionId,
        role: "assistant",
        content: fullResponse,
      });

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
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

Research Conversation:
${conversationText}

Generate a complete, professional document that synthesizes the research findings.`;

      const completion = await openai.chat.completions.create({
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

  return httpServer;
}
