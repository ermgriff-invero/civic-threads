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
  /**
   * When true, only docs with `docSummaryStale` and folders with `isDirty` are candidates.
   * Docs never summarized yet need a full run first (`docSummaryStale` is set on new/changed sync).
   */
  dirtyOnly?: boolean;
}

export interface ShadowTreeMapSummarizationResult {
  tenantKey: string;
  model: string;
  maxCompletionTokens: number;
  dirtyOnly: boolean;
  finishedAt: string;
  scope: { rootName: string; rootId: string };
  docsConsidered: number;
  docsSummarized: number;
  /** Doc had no `AI summary:` before this run. */
  docsFirstSummarized: number;
  /** Doc already had an AI summary; replaced in this run. */
  docsRegenerated: number;
  docFailures: Array<{ docId: number; title: string; error: string }>;
  /** Folder rollup produced by OpenAI this run. */
  foldersSummarized: number;
  /** Folder had no `ai_summary` before OpenAI rollup. */
  foldersFirstSummarized: number;
  /** Folder already had `ai_summary`; replaced by OpenAI rollup. */
  foldersRegenerated: number;
  /** Dirty folder cleared without LLM (no doc/child text to aggregate). */
  foldersDirtyClearedNoRollup: number;
  folderFailures: Array<{ folderId: number; title: string; error: string }>;
  docSummaries: Array<{ docId: number; title: string; summary: string; folderId: number | null }>;
  /** Pilot subtree size at end of run (same scope as shadow-tree stats). */
  mapSnapshot: { totalDocs: number; totalFolders: number };
  /** One row per doc candidate in this run (same order as processed). */
  docRunLog: Array<{
    docId: number;
    title: string;
    action: "summarized_first" | "summarized_regen" | "failed";
    detail?: string;
  }>;
  /**
   * One row per folder in bottom-up traversal order. Stale-only: `skipped_not_dirty` means the folder
   * was not on the dirty chain (e.g. sibling of the folder that contained the edited doc).
   */
  folderRunLog: Array<{
    folderId: number;
    title: string;
    action:
      | "rollup_first"
      | "rollup_regen"
      | "dirty_cleared_no_rollup"
      | "skipped_not_dirty"
      | "noop_nothing_to_roll_up"
      | "rollup_failed";
    detail?: string;
  }>;
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

/** Child folder summary text for rollup: this run’s OpenAI output, else existing DB `ai_summary`. */
function childFolderSummariesForRollup(
  childrenByFolder: Map<number, number[]>,
  parentFolderId: number,
  folderMap: Map<number, KnowledgeFolder>,
  folderSummaryText: Map<number, string>,
): string[] {
  const bits: string[] = [];
  for (const cid of childrenByFolder.get(parentFolderId) ?? []) {
    const fromThisRun = folderSummaryText.get(cid);
    if (fromThisRun) {
      bits.push(fromThisRun);
      continue;
    }
    const db = folderMap.get(cid)?.aiSummary?.trim();
    if (db) bits.push(db);
  }
  return bits;
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
  const dirtyOnly = Boolean(params.dirtyOnly);
  const summaryModel = params.summaryModel?.trim() || process.env.SHADOW_TREE_SUMMARY_MODEL?.trim() || "gpt-4o-mini";

  const scope = await resolveRootFolderByExactName(refreshToken, scopedRootName);
  const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
  const root = folders.find((f) => f.externalId === scope.folderId);
  if (!root) {
    throw new Error("Run sync first. Scoped root is not in local shadow tree yet.");
  }

  const subtreeFolderIds = collectSubtreeFolderIds(root, folders);
  const docs = await storage.getDriveDocumentsByFolderIds(subtreeFolderIds);

  const needsDocSummary = (d: (typeof docs)[number]) => {
    const missing = !d.description?.startsWith("AI summary:");
    if (d.sourceSystem !== "gdrive") return missing;
    if (dirtyOnly) return d.docSummaryStale === true;
    return missing;
  };

  const candidateDocs = docs.filter((d) => d.externalId).filter(needsDocSummary).slice(0, maxDocs);

  const docSummaries: ShadowTreeMapSummarizationResult["docSummaries"] = [];
  const docFailures: ShadowTreeMapSummarizationResult["docFailures"] = [];
  const docRunLog: ShadowTreeMapSummarizationResult["docRunLog"] = [];
  let docsFirstSummarized = 0;
  let docsRegenerated = 0;

  for (const doc of candidateDocs) {
    const hadDocAiSummary = Boolean(doc.description?.startsWith("AI summary:"));
    try {
      const preview = await (verbose
        ? driveDebugTimed(steps, `preview:${doc.id}`, () =>
            previewDriveFile(refreshToken, doc.externalId!, undefined),
          )
        : previewDriveFile(refreshToken, doc.externalId!, undefined));
      if (!preview.text?.trim()) {
        docFailures.push({ docId: doc.id, title: doc.title, error: "No extractable text preview." });
        docRunLog.push({
          docId: doc.id,
          title: doc.title,
          action: "failed",
          detail: "No extractable text preview.",
        });
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
        const err = `Empty summary (finish_reason=${completion.choices[0]?.finish_reason ?? "unknown"})`;
        docFailures.push({
          docId: doc.id,
          title: doc.title,
          error: err,
        });
        docRunLog.push({ docId: doc.id, title: doc.title, action: "failed", detail: err });
        continue;
      }
      await storage.updateDocument(doc.id, {
        description: `AI summary: ${summary}`,
        processingStatus: "summarized",
        indexed: true,
        docSummaryStale: false,
      });
      if (doc.folderId !== null) {
        await storage.markFolderAndAncestorsDirty(tenantKey, doc.folderId);
      }
      docSummaries.push({
        docId: doc.id,
        title: doc.title,
        summary,
        folderId: doc.folderId,
      });
      if (hadDocAiSummary) {
        docsRegenerated += 1;
      } else {
        docsFirstSummarized += 1;
      }
      docRunLog.push({
        docId: doc.id,
        title: doc.title,
        action: hadDocAiSummary ? "summarized_regen" : "summarized_first",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      docFailures.push({ docId: doc.id, title: doc.title, error: msg });
      docRunLog.push({ docId: doc.id, title: doc.title, action: "failed", detail: msg });
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
  let foldersFirstSummarized = 0;
  let foldersRegenerated = 0;
  let foldersDirtyClearedNoRollup = 0;
  const folderFailures: ShadowTreeMapSummarizationResult["folderFailures"] = [];
  const folderRunLog: ShadowTreeMapSummarizationResult["folderRunLog"] = [];

  for (const fid of ordered) {
    const node = folderMap.get(fid);
    if (!node) continue;
    if (dirtyOnly) {
      const live = await storage.getKnowledgeFolderByIdForTenant(tenantKey, fid);
      if (!live?.isDirty) {
        folderRunLog.push({ folderId: fid, title: node.title, action: "skipped_not_dirty" });
        continue;
      }
    }
    const docBits = docsByFolder.get(fid) ?? [];
    const childBits = childFolderSummariesForRollup(childrenByFolder, fid, folderMap, folderSummaryText);
    if (docBits.length === 0 && childBits.length === 0) {
      const live = await storage.getKnowledgeFolderByIdForTenant(tenantKey, fid);
      if (live?.isDirty) {
        await storage.upsertKnowledgeFolderByExternalId({
          tenantKey,
          connectionId: node.connectionId,
          parentId: node.parentId,
          title: node.title,
          externalId: node.externalId,
          aiSummary: node.aiSummary ?? null,
          isDirty: false,
          driveModifiedAt: node.driveModifiedAt ?? undefined,
          syncedAt: new Date(),
        });
        foldersDirtyClearedNoRollup += 1;
        folderRunLog.push({ folderId: fid, title: node.title, action: "dirty_cleared_no_rollup" });
      } else {
        folderRunLog.push({ folderId: fid, title: node.title, action: "noop_nothing_to_roll_up" });
      }
      continue;
    }
    const hadFolderAiSummary = Boolean(node.aiSummary?.trim());
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
        const err = `Empty folder summary (finish_reason=${completion.choices[0]?.finish_reason ?? "unknown"})`;
        folderFailures.push({
          folderId: fid,
          title: node.title,
          error: err,
        });
        folderRunLog.push({ folderId: fid, title: node.title, action: "rollup_failed", detail: err });
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
        driveModifiedAt: node.driveModifiedAt ?? undefined,
        syncedAt: new Date(),
      });
      foldersSummarized += 1;
      if (hadFolderAiSummary) {
        foldersRegenerated += 1;
      } else {
        foldersFirstSummarized += 1;
      }
      folderRunLog.push({
        folderId: fid,
        title: node.title,
        action: hadFolderAiSummary ? "rollup_regen" : "rollup_first",
      });
      if (node.parentId !== null) {
        await storage.markFolderAndAncestorsDirty(tenantKey, node.parentId);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      folderFailures.push({ folderId: fid, title: node.title, error: msg });
      folderRunLog.push({ folderId: fid, title: node.title, action: "rollup_failed", detail: msg });
    }
  }

  const gdocsInSubtree = docs.filter((d) => d.sourceSystem === "gdrive");

  return {
    tenantKey,
    model: summaryModel,
    maxCompletionTokens,
    dirtyOnly,
    finishedAt: new Date().toISOString(),
    scope: { rootName: scopedRootName, rootId: scope.folderId },
    docsConsidered: candidateDocs.length,
    docsSummarized: docSummaries.length,
    docsFirstSummarized,
    docsRegenerated,
    docFailures: docFailures.slice(0, 20),
    foldersSummarized,
    foldersFirstSummarized,
    foldersRegenerated,
    foldersDirtyClearedNoRollup,
    folderFailures: folderFailures.slice(0, 20),
    docSummaries,
    mapSnapshot: {
      totalDocs: gdocsInSubtree.length,
      totalFolders: subtreeFolderIds.length,
    },
    docRunLog,
    folderRunLog,
  };
}
