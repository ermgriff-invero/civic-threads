import type { KnowledgeFolder } from "@shared/schema";

/** Parent ids from `startFolderId` up to root (excludes `startFolderId`). Used for tests + propagation. */
export function collectAncestorFolderIds(
  foldersById: Map<number, KnowledgeFolder>,
  startFolderId: number,
): number[] {
  const out: number[] = [];
  let cur = foldersById.get(startFolderId);
  let parentId = cur?.parentId ?? null;
  while (parentId !== null) {
    out.push(parentId);
    cur = foldersById.get(parentId);
    parentId = cur?.parentId ?? null;
  }
  return out;
}
