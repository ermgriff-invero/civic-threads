/**
 * Aggregate counts for the scoped pilot subtree: dirty flags vs missing AI map text.
 */
import { storage } from "../../storage";
import { loadScopedSubtreeContext } from "./shadow-tree-agent-tools";

const SCOPED_ROOT_NAME = "Civic Threads pilot";

export type ShadowTreePilotStatsOk = {
  ok: true;
  tenantKey: string;
  scopedRootName: string;
  /** Folders in pilot subtree (including root). */
  totalFolders: number;
  /** Drive-backed documents in subtree. */
  totalDocs: number;
  /** Folders with `isDirty` (rollup may be stale). */
  dirtyFolders: number;
  /** Folders with no `ai_summary` text yet. */
  foldersMissingAiSummary: number;
  /** Docs without an `AI summary:` description line. */
  docsMissingAiSummary: number;
  /** Docs flagged `docSummaryStale` (Drive revision changed vs last summary). */
  docsMarkedStale: number;
};

export async function getShadowTreePilotStats(
  tenantKey: string,
  refreshToken: string,
  scopedRootName: string = SCOPED_ROOT_NAME,
): Promise<ShadowTreePilotStatsOk | { ok: false; error: string }> {
  const ctx = await loadScopedSubtreeContext(tenantKey, refreshToken, scopedRootName);
  if ("error" in ctx) {
    return { ok: false, error: ctx.error };
  }

  const foldersInSubtree = ctx.folders.filter((f) => ctx.subtreeIds.has(f.id));
  const docs = await storage.getDriveDocumentsByFolderIds(Array.from(ctx.subtreeIds));

  const dirtyFolders = foldersInSubtree.filter((f) => f.isDirty).length;
  const foldersMissingAiSummary = foldersInSubtree.filter((f) => !f.aiSummary?.trim()).length;

  const gdocs = docs.filter((d) => d.sourceSystem === "gdrive");
  const docsMissingAiSummary = gdocs.filter((d) => !d.description?.startsWith("AI summary:")).length;
  const docsMarkedStale = gdocs.filter((d) => d.docSummaryStale).length;

  return {
    ok: true,
    tenantKey,
    scopedRootName,
    totalFolders: foldersInSubtree.length,
    totalDocs: gdocs.length,
    dirtyFolders,
    foldersMissingAiSummary,
    docsMissingAiSummary,
    docsMarkedStale,
  };
}
