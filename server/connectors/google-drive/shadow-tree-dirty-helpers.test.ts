import { describe, expect, it } from "vitest";
import type { KnowledgeFolder } from "@shared/schema";
import { collectAncestorFolderIds } from "./shadow-tree-dirty-helpers";

function folder(
  id: number,
  parentId: number | null,
  title: string,
): KnowledgeFolder {
  return {
    id,
    tenantKey: "t1",
    connectionId: 1,
    parentId,
    title,
    externalId: `ext-${id}`,
    aiSummary: null,
    isDirty: false,
    driveModifiedAt: null,
    syncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("collectAncestorFolderIds", () => {
  it("returns parent chain excluding start id", () => {
    const rows: KnowledgeFolder[] = [
      folder(1, null, "root"),
      folder(2, 1, "a"),
      folder(3, 2, "b"),
      folder(4, 3, "leaf"),
    ];
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(collectAncestorFolderIds(byId, 4)).toEqual([3, 2, 1]);
    expect(collectAncestorFolderIds(byId, 1)).toEqual([]);
  });
});
