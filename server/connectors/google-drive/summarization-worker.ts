/**
 * Shadow Tree Day 3 — bottom-up “map” generation: document summaries, then folder rollups.
 * Used by POST /api/integrations/google-drive/summaries/run.
 */
import { storage } from "../../storage";
import { asNonStreamingChatCompletion, getOpenAI } from "../../openai-client";
import { previewDriveFile } from "./drive-preview";
import { resolveRootFolderByExactName } from "./drive-api";
import type { DriveDebugStep } from "./debug";
import { driveDebugTimed } from "./debug";
import type { Document, KnowledgeFolder } from "@shared/schema";

export interface ShadowTreeMapSummarizationParams {
  tenantKey: string;
  refreshToken: string;
  scopedRootName: string;
  verbose?: boolean;
  steps?: DriveDebugStep[];
  maxCompletionTokens: number;
  maxDocs: number;
  summaryModel?: string;
}

export interface ShadowTreeMapSummarizationResult {
  tenantKey: string;
  model: string;
  maxCompletionTokens: number;
  scope: { rootName: string; rootId: string };
  docsConsidered: number;
  docsSummarized: number;
  docFailures: Array<{ docId: number; title: string; error: string }>;
  foldersSummarized: number;
  folderFailures: Array<{ folderId: number; title: string; error: string }>;
  docSummaries: Array<{ docId: number; title: string; summary: string; folderId: number | null }>;
}

function applyTemperatureForModel(
  model: string,
  payload: Parameters<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>[0],
) {
  if (!model.startsWith("gpt-5")) {
    (payload as { temperature?: number }).temperature = 0.2;
  }
}

function collectSubtreeFolderIds(root: KnowledgeFolder, folders: KnowledgeFolder[]): number[] {
  const descendants = new Set<number>([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parentId !== null && descendants.has(f.parentId) && !descendants.has(f.id)) {
        descendants.add(f.id);
        changed = true;
      }
    }
  }
  return Array.from(descendants);
}

function buildDocsByFolder(
  docs: Document[],
  docSummaries: Array<{ docId: number; title: string; summary: string; folderId: number | null }>,
): Map<number, string[]> {
  const docsByFolder = new Map<number, string[]>();
  for (const d of docs) {
    if (d.folderId !== null && d.description?.startsWith("AI summary:")) {
      const arr = docsByFolder.get(d.folderId) ?? [];
      arr.push(d.description.replace(/^AI summary:\s*/, "").trim());
      docsByFolder.set(d.folderId, arr);
    }
  }
  // Critical: `docs` was loaded before this run; merge in summaries produced in this pass.
  for (const row of docSummaries) {
    if (row.folderId !== null) {
      const arr = docsByFolder.get(row.folderId) ?? [];
      arr.push(row.summary);
      docsByFolder.set(row.folderId, arr);
    }
  }
  return docsByFolder;
}

export async function runShadowTreeMapSummarization(
  params: ShadowTreeMapSummarizationParams,
): Promise<ShadowTreeMapSummarizationResult> {
  const {
    tenantKey,
    refreshToken,
    scopedRootName,
    verbose = false,
    steps = [],
    maxCompletionTokens,
    maxDocs,
  } = params;
  const summaryModel = params.summaryModel?.trim() || process.env.SHADOW_TREE_SUMMARY_MODEL?.trim() || "gpt-4o-mini";

  const scope = await resolveRootFolderByExactName(refreshToken, scopedRootName);
  const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
  const root = folders.find((f) => f.externalId === scope.folderId);
  if (!root) {
    throw new Error("Run sync first. Scoped root is not in local shadow tree yet.");
  }

  const subtreeFolderIds = collectSubtreeFolderIds(root, folders);
  const docs = await storage.getDriveDocumentsByFolderIds(subtreeFolderIds);

  const candidateDocs = docs
    .filter((d) => d.externalId)
    .filter((d) => !d.description?.startsWith("AI summary:"))
    .slice(0, maxDocs);

  const docSummaries: ShadowTreeMapSummarizationResult["docSummaries"] = [];
  const docFailures: ShadowTreeMapSummarizationResult["docFailures"] = [];

  for (const doc of candidateDocs) {
    try {
      const preview = await (verbose
        ? driveDebugTimed(steps, `preview:${doc.id}`, () =>
            previewDriveFile(refreshToken, doc.externalId!, undefined),
          )
        : previewDriveFile(refreshToken, doc.externalId!, undefined));
      if (!preview.text?.trim()) {
        docFailures.push({ docId: doc.id, title: doc.title, error: "No extractable text preview." });
        continue;
      }

      const promptText = `Document title: ${doc.title}\n\nDocument text:\n${preview.text.slice(0, 12000)}`;
      const chatRequest: Parameters<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>[0] = {
        model: summaryModel,
        messages: [
          {
            role: "system",
            content:
              "Summarize municipal/government documents in one concise paragraph with specific entities, dates, and decisions.",
          },
          { role: "user", content: promptText },
        ],
        max_completion_tokens: maxCompletionTokens,
        stream: false,
      };
      applyTemperatureForModel(summaryModel, chatRequest);
      const completion = asNonStreamingChatCompletion(
        await (verbose
          ? driveDebugTimed(steps, `openai:${doc.id}`, () => getOpenAI().chat.completions.create(chatRequest))
          : getOpenAI().chat.completions.create(chatRequest)),
      );
      const summary = completion.choices[0]?.message?.content?.trim();
      if (!summary) {
        docFailures.push({
          docId: doc.id,
          title: doc.title,
          error: `Empty summary (finish_reason=${completion.choices[0]?.finish_reason ?? "unknown"})`,
        });
        continue;
      }
      await storage.updateDocument(doc.id, {
        description: `AI summary: ${summary}`,
        processingStatus: "summarized",
        indexed: true,
      });
      docSummaries.push({
        docId: doc.id,
        title: doc.title,
        summary,
        folderId: doc.folderId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      docFailures.push({ docId: doc.id, title: doc.title, error: msg });
    }
  }

  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const childrenByFolder = new Map<number, number[]>();
  for (const f of folders) {
    if (f.parentId !== null) {
      const arr = childrenByFolder.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenByFolder.set(f.parentId, arr);
    }
  }

  const docsByFolder = buildDocsByFolder(docs, docSummaries);

  const depth = new Map<number, number>();
  const computeDepth = (id: number): number => {
    if (depth.has(id)) return depth.get(id)!;
    const node = folderMap.get(id);
    if (!node || node.parentId === null) {
      depth.set(id, 0);
      return 0;
    }
    const d = computeDepth(node.parentId) + 1;
    depth.set(id, d);
    return d;
  };
  const ordered = subtreeFolderIds
    .map((id) => ({ id, d: computeDepth(id) }))
    .sort((a, b) => b.d - a.d)
    .map((x) => x.id);

  const folderSummaryText = new Map<number, string>();
  let foldersSummarized = 0;
  const folderFailures: ShadowTreeMapSummarizationResult["folderFailures"] = [];

  for (const fid of ordered) {
    const node = folderMap.get(fid);
    if (!node) continue;
    const docBits = docsByFolder.get(fid) ?? [];
    const childBits = (childrenByFolder.get(fid) ?? [])
      .map((cid) => folderSummaryText.get(cid))
      .filter((s): s is string => Boolean(s));
    if (docBits.length === 0 && childBits.length === 0) {
      continue;
    }
    const aggregateInput = `Folder: ${node.title}\n\nDocument summaries:\n${docBits
      .slice(0, 8)
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}\n\nChild folder summaries:\n${childBits
      .slice(0, 8)
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}`.slice(0, 12000);
    try {
      const reqPayload: Parameters<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>[0] = {
        model: summaryModel,
        messages: [
          {
            role: "system",
            content:
              "Summarize folder contents for retrieval navigation. Mention key topics, dates, entities, and decision signals.",
          },
          { role: "user", content: aggregateInput },
        ],
        max_completion_tokens: Math.min(500, maxCompletionTokens),
        stream: false,
      };
      applyTemperatureForModel(summaryModel, reqPayload);
      const completion = asNonStreamingChatCompletion(
        await (verbose
          ? driveDebugTimed(steps, `folder-openai:${fid}`, () => getOpenAI().chat.completions.create(reqPayload))
          : getOpenAI().chat.completions.create(reqPayload)),
      );
      const s = completion.choices[0]?.message?.content?.trim();
      if (!s) {
        folderFailures.push({
          folderId: fid,
          title: node.title,
          error: `Empty folder summary (finish_reason=${completion.choices[0]?.finish_reason ?? "unknown"})`,
        });
        continue;
      }
      folderSummaryText.set(fid, s);
      await storage.upsertKnowledgeFolderByExternalId({
        tenantKey,
        connectionId: node.connectionId,
        parentId: node.parentId,
        title: node.title,
        externalId: node.externalId,
        aiSummary: s,
        isDirty: false,
        syncedAt: new Date(),
      });
      foldersSummarized += 1;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      folderFailures.push({ folderId: fid, title: node.title, error: msg });
    }
  }

  return {
    tenantKey,
    model: summaryModel,
    maxCompletionTokens,
    scope: { rootName: scopedRootName, rootId: scope.folderId },
    docsConsidered: candidateDocs.length,
    docsSummarized: docSummaries.length,
    docFailures: docFailures.slice(0, 20),
    foldersSummarized,
    folderFailures: folderFailures.slice(0, 20),
    docSummaries,
  };
}
