/**
 * Shadow Tree Day 4 — OpenAI tool loop: list_folder + read_document.
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { asNonStreamingChatCompletion, getOpenAI } from "../../openai-client";
import {
  executeListFolderTool,
  executeReadDocumentTool,
  loadScopedSubtreeContext,
} from "./shadow-tree-agent-tools";
import { compactShadowTreeForAgentPrompt, getShadowTreeHierarchy } from "./shadow-tree-hierarchy";

const SCOPED_ROOT_NAME = "Civic Threads pilot";

function parsePositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.floor(v);
    return n > 0 ? n : null;
  }
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = parseInt(v, 10);
    return n > 0 ? n : null;
  }
  return null;
}

const shadowTreeTools = [
  {
    type: "function" as const,
    function: {
      name: "list_folder",
      description:
        "List immediate child folders and files under a knowledge folder. Returns titles and AI summaries from the shadow map (no full document text). Use database folder ids from this tool or the root folder id from the system prompt.",
      parameters: {
        type: "object",
        properties: {
          folder_id: {
            type: "integer",
            description: "knowledge_folders.id (numeric) for the folder to open.",
          },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_document",
      description:
        "Fetch live extractable text for one Google Drive file using documents.id from list_folder. Large text may be truncated with a marker.",
      parameters: {
        type: "object",
        properties: {
          document_id: {
            type: "integer",
            description: "documents.id (numeric) for the file to read.",
          },
        },
        required: ["document_id"],
      },
    },
  },
];

export interface ShadowTreeAgentQueryResult {
  ok: true;
  answer: string;
  tenantKey: string;
  rootFolderId: number;
  rootFolderTitle: string;
  model: string;
  rounds: number;
  toolCallsExecuted: number;
}

export async function runShadowTreeAgentQuery(input: {
  tenantKey: string;
  refreshToken: string;
  question: string;
  /** When true (default), prepend a compact outline of folder + document summaries from the DB. */
  includeTreeContext?: boolean;
}): Promise<ShadowTreeAgentQueryResult | { ok: false; error: string }> {
  const ctx = await loadScopedSubtreeContext(input.tenantKey, input.refreshToken, SCOPED_ROOT_NAME);
  if ("error" in ctx) {
    return { ok: false, error: ctx.error };
  }

  const model = process.env.SHADOW_TREE_AGENT_MODEL?.trim() || "gpt-4o-mini";
  const maxRounds = Math.max(2, Math.min(12, parseInt(process.env.SHADOW_TREE_AGENT_MAX_ROUNDS ?? "8", 10) || 8));

  let systemPrompt = `You are Shadow Tree Agent (pilot) for municipal staff. You navigate a mirrored Google Drive folder tree using tools.

Scoped Drive root folder: "${ctx.root.title}" (database folder id: ${ctx.root.id}). Start from this id when you need top-level contents.

Rules:
- The shadow map stores metadata and AI summaries in our database; list_folder returns that map for a folder. It is not necessarily full file text.
- Use list_folder to explore when you need structure beyond the snapshot below (if any).
- Use read_document when you need exact wording or full extractable text from a file (live from Google Drive).
- Prefer a small number of tool calls; stop when you can answer the question.
- Answer concisely in plain language. Mention document titles and ids when citing content.`;

  const includeTreeContext = input.includeTreeContext !== false;
  if (includeTreeContext) {
    const treeResult = await getShadowTreeHierarchy(input.tenantKey, input.refreshToken, SCOPED_ROOT_NAME);
    if (treeResult.ok) {
      const snap = compactShadowTreeForAgentPrompt(treeResult.root);
      if (snap.trim()) {
        systemPrompt += `\n\n## Shadow map snapshot (DB: folder summaries + document summary snippets)\nThis orients you on what is in the pilot tree; use tools to drill down or read full text.\n\n${snap}`;
      }
    }
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: input.question },
  ];

  let rounds = 0;
  let toolCallsExecuted = 0;

  while (rounds < maxRounds) {
    rounds += 1;
    const req: Parameters<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>[0] = {
      model,
      messages,
      tools: shadowTreeTools,
      tool_choice: "auto",
      stream: false,
      max_completion_tokens: 1200,
    };
    if (!model.startsWith("gpt-5")) {
      (req as { temperature?: number }).temperature = 0.3;
    }

    const completion = asNonStreamingChatCompletion(await getOpenAI().chat.completions.create(req));
    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      return { ok: false, error: "OpenAI returned no message." };
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      refusal: msg.refusal,
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    } as ChatCompletionMessageParam);

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      const text = msg.content?.trim() || "";
      if (!text) {
        return { ok: false, error: "Model returned empty final message." };
      }
      return {
        ok: true,
        answer: text,
        tenantKey: input.tenantKey,
        rootFolderId: ctx.root.id,
        rootFolderTitle: ctx.root.title,
        model,
        rounds,
        toolCallsExecuted,
      };
    }

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }

      let payload: Record<string, unknown>;
      if (tc.function.name === "list_folder") {
        const folderId = parsePositiveInt(args.folder_id);
        if (folderId === null) {
          payload = { ok: false, error: "Invalid folder_id" };
        } else {
          payload = await executeListFolderTool({
            tenantKey: input.tenantKey,
            refreshToken: input.refreshToken,
            folderId,
          });
        }
      } else if (tc.function.name === "read_document") {
        const documentId = parsePositiveInt(args.document_id);
        if (documentId === null) {
          payload = { ok: false, error: "Invalid document_id" };
        } else {
          payload = await executeReadDocumentTool({
            tenantKey: input.tenantKey,
            refreshToken: input.refreshToken,
            documentId,
          });
        }
      } else {
        payload = { ok: false, error: `Unknown tool ${tc.function.name}` };
      }

      toolCallsExecuted += 1;
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(payload),
      });
    }
  }

  return {
    ok: false,
    error: `Tool loop stopped after ${maxRounds} rounds without a final answer. Try a narrower question.`,
  };
}
