/**
 * Shadow Tree Day 4 — agent tools: navigate mirrored folder map (summaries) and live-read files.
 */
import type { KnowledgeFolder } from "@shared/schema";
import { storage } from "../../storage";
import { resolveRootFolderByExactName } from "./drive-api";
import { previewDriveFile } from "./drive-preview";
import {
  getCachedReadDocumentPreview,
  readDocumentCacheKey,
  setCachedReadDocumentPreview,
} from "./read-document-cache";

const SCOPED_ROOT_NAME = "Civic Threads pilot";
const MAX_TOOL_TEXT_CHARS = 24_000;
const MAX_LIST_ITEMS = 60;

export type ScopedSubtreeContext = {
  scopedRootName: string;
  root: KnowledgeFolder;
  subtreeIds: Set<number>;
  folders: KnowledgeFolder[];
};

export async function loadScopedSubtreeContext(
  tenantKey: string,
  refreshToken: string,
  scopedRootName: string = SCOPED_ROOT_NAME,
): Promise<ScopedSubtreeContext | { error: string }> {
  const scope = await resolveRootFolderByExactName(refreshToken, scopedRootName);
  const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
  const root = folders.find((f) => f.externalId === scope.folderId);
  if (!root) {
    return { error: "Run sync first. Scoped root is not in the local shadow tree." };
  }
  const subtreeIds = new Set<number>([root.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parentId !== null && subtreeIds.has(f.parentId) && !subtreeIds.has(f.id)) {
        subtreeIds.add(f.id);
        changed = true;
      }
    }
  }
  return { scopedRootName, root, subtreeIds, folders };
}

function clip(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max) + "\n…[truncated for tool payload]", truncated: true };
}

export async function executeListFolderTool(input: {
  tenantKey: string;
  refreshToken: string;
  folderId: number;
}): Promise<Record<string, unknown>> {
  const ctx = await loadScopedSubtreeContext(input.tenantKey, input.refreshToken);
  if ("error" in ctx) {
    return { ok: false, error: ctx.error };
  }
  if (!ctx.subtreeIds.has(input.folderId)) {
    return { ok: false, error: "folder_id is not in the Civic Threads pilot subtree for this tenant." };
  }
  const folder = await storage.getKnowledgeFolderByIdForTenant(input.tenantKey, input.folderId);
  if (!folder) {
    return { ok: false, error: "Folder not found." };
  }

  const childFolders = ctx.folders
    .filter((f) => f.parentId === input.folderId)
    .slice(0, MAX_LIST_ITEMS)
    .map((f) => ({
      id: f.id,
      title: f.title,
      aiSummary: f.aiSummary ?? null,
      externalId: f.externalId,
    }));

  const docs = (await storage.getDriveDocumentsByFolderIds([input.folderId])).slice(0, MAX_LIST_ITEMS);
  const documents = docs.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    summary:
      d.description?.startsWith("AI summary:") ? d.description.replace(/^AI summary:\s*/, "").trim() : null,
    externalId: d.externalId,
  }));

  return {
    ok: true,
    folder: {
      id: folder.id,
      title: folder.title,
      aiSummary: folder.aiSummary ?? null,
      externalId: folder.externalId,
    },
    childFolders,
    documents,
    note: "Summaries are from the shadow map; use read_document(document_id) for full text.",
  };
}

/** Live-fetch file text for a Drive-backed `documents.id` inside the scoped subtree. */
export async function executeReadDocumentTool(input: {
  tenantKey: string;
  refreshToken: string;
  documentId: number;
}): Promise<Record<string, unknown>> {
  const ctx = await loadScopedSubtreeContext(input.tenantKey, input.refreshToken);
  if ("error" in ctx) {
    return { ok: false, error: ctx.error };
  }

  const doc = await storage.getDocument(input.documentId);
  if (!doc) {
    return { ok: false, error: "Document not found." };
  }
  if (doc.sourceSystem !== "gdrive" || !doc.externalId) {
    return { ok: false, error: "Not a Google Drive-backed document in the shadow tree." };
  }
  if (doc.folderId === null || !ctx.subtreeIds.has(doc.folderId)) {
    return { ok: false, error: "Document is outside the Civic Threads pilot subtree." };
  }

  const cacheKey = readDocumentCacheKey(doc.id, doc.driveModifiedAt);
  const cached = getCachedReadDocumentPreview(cacheKey);
  const preview = cached
    ? {
        text: cached.text,
        mimeType: cached.mimeType,
        previewKind: cached.previewKind,
        truncated: cached.truncated,
        note: cached.note,
      }
    : await previewDriveFile(input.refreshToken, doc.externalId, undefined);
  if (!cached) {
    setCachedReadDocumentPreview(cacheKey, {
      text: preview.text ?? "",
      mimeType: preview.mimeType ?? null,
      previewKind: preview.previewKind,
      truncated: Boolean(preview.truncated),
      note: preview.note ?? null,
    });
  }
  const text = preview.text ?? "";
  const clipped = clip(text, MAX_TOOL_TEXT_CHARS);

  return {
    ok: true,
    document: {
      id: doc.id,
      title: doc.title,
      folderId: doc.folderId,
      mimeType: preview.mimeType,
      previewKind: preview.previewKind,
    },
    text: clipped.text,
    textTruncated: clipped.truncated || Boolean(preview.truncated),
    note: preview.note ?? null,
  };
}
