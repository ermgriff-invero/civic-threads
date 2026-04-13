/**
 * Shadow tree view model: nested folders + Drive-backed docs with AI summary snippets.
 */
import type { Document, KnowledgeFolder } from "@shared/schema";
import { storage } from "../../storage";
import { loadScopedSubtreeContext } from "./shadow-tree-agent-tools";

const SCOPED_ROOT_NAME = "Civic Threads pilot";

export type ShadowTreeDocBrief = {
  id: number;
  title: string;
  type: string;
  summary: string | null;
};

export type ShadowTreeNode = {
  id: number;
  title: string;
  externalId: string;
  aiSummary: string | null;
  isDirty: boolean;
  documents: ShadowTreeDocBrief[];
  children: ShadowTreeNode[];
};

function docSummary(d: Document): string | null {
  if (!d.description?.startsWith("AI summary:")) return null;
  return d.description.replace(/^AI summary:\s*/, "").trim();
}

export async function getShadowTreeHierarchy(
  tenantKey: string,
  refreshToken: string,
  scopedRootName: string = SCOPED_ROOT_NAME,
): Promise<
  | { ok: true; root: ShadowTreeNode; stats: { folderCount: number; documentCount: number } }
  | { ok: false; error: string }
> {
  const ctx = await loadScopedSubtreeContext(tenantKey, refreshToken, scopedRootName);
  if ("error" in ctx) {
    return { ok: false, error: ctx.error };
  }

  const foldersInSubtree = ctx.folders.filter((f) => ctx.subtreeIds.has(f.id));
  const docs = await storage.getDriveDocumentsByFolderIds(Array.from(ctx.subtreeIds));

  const docsByFolder = new Map<number, Document[]>();
  for (const d of docs) {
    if (d.folderId === null) continue;
    const arr = docsByFolder.get(d.folderId) ?? [];
    arr.push(d);
    docsByFolder.set(d.folderId, arr);
  }
  for (const arr of Array.from(docsByFolder.values())) {
    arr.sort((a: Document, b: Document) => a.title.localeCompare(b.title));
  }

  const childrenByParent = new Map<number | null, KnowledgeFolder[]>();
  for (const f of foldersInSubtree) {
    const p = f.parentId ?? null;
    const arr = childrenByParent.get(p) ?? [];
    arr.push(f);
    childrenByParent.set(p, arr);
  }
  for (const arr of Array.from(childrenByParent.values())) {
    arr.sort((a: KnowledgeFolder, b: KnowledgeFolder) => a.title.localeCompare(b.title));
  }

  const folderById = new Map(foldersInSubtree.map((f) => [f.id, f]));

  function buildNode(folderId: number): ShadowTreeNode {
    const folder = folderById.get(folderId);
    if (!folder) {
      throw new Error(`Missing folder ${folderId}`);
    }
    const childFolders = childrenByParent.get(folderId) ?? [];
    const folderDocs = docsByFolder.get(folderId) ?? [];
    return {
      id: folder.id,
      title: folder.title,
      externalId: folder.externalId,
      aiSummary: folder.aiSummary ?? null,
      isDirty: folder.isDirty,
      documents: folderDocs.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        summary: docSummary(d),
      })),
      children: childFolders.map((c) => buildNode(c.id)),
    };
  }

  const root = buildNode(ctx.root.id);
  return {
    ok: true,
    root,
    stats: { folderCount: foldersInSubtree.length, documentCount: docs.length },
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Compact outline for the agent system prompt (not full file text). */
export function compactShadowTreeForAgentPrompt(root: ShadowTreeNode, maxChars = 12_000): string {
  const lines: string[] = [];

  function walk(node: ShadowTreeNode, depth: number) {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}• Folder [${node.id}] ${node.title}`);
    if (node.aiSummary) {
      lines.push(`${pad}  folder summary: ${truncate(node.aiSummary, 420)}`);
    }
    for (const d of node.documents) {
      const bit = d.summary ? ` — ${truncate(d.summary, 300)}` : "";
      lines.push(`${pad}  ◦ Doc [${d.id}] ${d.title}${bit}`);
    }
    for (const c of node.children) {
      walk(c, depth + 1);
    }
  }

  walk(root, 0);
  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + "\n…[shadow map snapshot truncated]";
  }
  return out;
}
