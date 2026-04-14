import { storage } from "../../storage";
import {
  getDriveChangesStartPageToken,
  getDriveFileMetadata,
  listDriveChangesPage,
  listFolderChildrenRaw,
  resolveRootFolderByExactName,
  type DriveFileNode,
} from "./drive-api";
import { driveModifiedTimeToEpochMs, driveRevisionChanged } from "./drive-time";

const SCOPED_ROOT_NAME = "Civic Threads pilot";

export interface DriveSyncOptions {
  tenantKey: string;
  dryRun?: boolean;
  debug?: boolean;
}

export interface DriveSyncStats {
  rootName: string;
  rootId: string;
  tenantKey: string;
  dryRun: boolean;
  foldersSeen: number;
  filesSeen: number;
  foldersUpserted: number;
  docsUpserted: number;
  pagesFetched: number;
  driveChangesPages?: number;
}

function classifyDocument(file: DriveFileNode): { type: string; category: string } {
  const mt = file.mimeType.toLowerCase();
  if (mt.includes("pdf")) return { type: "pdf", category: "Policy" };
  if (mt.includes("spreadsheet") || mt.includes("csv") || mt.includes("sheet")) {
    return { type: "report", category: "Budget" };
  }
  if (mt.includes("document") || mt.includes("text")) return { type: "text", category: "Other" };
  if (mt.includes("presentation")) return { type: "report", category: "Other" };
  if (mt.startsWith("image/")) return { type: "other", category: "Other" };
  return { type: "other", category: "Other" };
}

function driveDateFromIso(iso: string | undefined): Date | null {
  const ms = driveModifiedTimeToEpochMs(iso);
  return ms === null ? null : new Date(ms);
}

async function walkChildren(
  refreshToken: string,
  parentExternalId: string,
): Promise<{ children: DriveFileNode[]; pagesFetched: number }> {
  let pageToken: string | undefined;
  const children: DriveFileNode[] = [];
  let pagesFetched = 0;
  do {
    const page = await listFolderChildrenRaw(refreshToken, parentExternalId, 100, pageToken);
    children.push(...page.files);
    pageToken = page.nextPageToken;
    pagesFetched += 1;
  } while (pageToken);
  return { children, pagesFetched };
}

/**
 * Apply Drive `changes.list` hints: mark mirrored folders/docs dirty when Google reports activity.
 * First sync: no token → establish baseline only. Later syncs: drain pages and advance token.
 */
async function applyDriveChangeHints(
  tenantKey: string,
  refreshToken: string,
  startPageToken: string | null,
): Promise<{ pages: number; newStartPageToken: string | null }> {
  let token = startPageToken;
  if (!token) {
    const t = await getDriveChangesStartPageToken(refreshToken);
    await storage.updateGoogleDriveConnectionChangesToken(tenantKey, t);
    return { pages: 0, newStartPageToken: t };
  }

  const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
  const folderIds = folders.map((f) => f.id);
  const docs = await storage.getDriveDocumentsByFolderIds(folderIds);
  const externalHit = new Set<string>();
  for (const f of folders) externalHit.add(f.externalId);
  for (const d of docs) {
    if (d.externalId) externalHit.add(d.externalId);
  }

  let pages = 0;
  let pageToken: string | undefined = token;
  let lastNewStart: string | null = null;

  while (pageToken) {
    pages += 1;
    const page = await listDriveChangesPage(refreshToken, pageToken);
    for (const ch of page.changes) {
      if (ch.removed || !externalHit.has(ch.fileId)) continue;
      const folder = await storage.getKnowledgeFolderByExternalId(tenantKey, ch.fileId);
      if (folder) {
        await storage.markFolderAndAncestorsDirty(tenantKey, folder.id);
        continue;
      }
      const doc = await storage.getDriveDocumentByExternalIdAndSource(ch.fileId);
      if (doc?.folderId) {
        await storage.markFolderAndAncestorsDirty(tenantKey, doc.folderId);
      }
    }
    if (page.newStartPageToken) {
      lastNewStart = page.newStartPageToken;
    }
    pageToken = page.nextPageToken;
  }

  if (lastNewStart) {
    await storage.updateGoogleDriveConnectionChangesToken(tenantKey, lastNewStart);
  }
  return { pages, newStartPageToken: lastNewStart };
}

export async function runScopedDriveSync(options: DriveSyncOptions): Promise<DriveSyncStats> {
  const conn = await storage.getGoogleDriveConnectionForTenant(options.tenantKey);
  if (!conn) {
    throw new Error(`No Google Drive connection found for tenant "${options.tenantKey}".`);
  }

  const scope = await resolveRootFolderByExactName(conn.refreshToken, SCOPED_ROOT_NAME);
  const dryRun = Boolean(options.dryRun);
  const stats: DriveSyncStats = {
    rootName: scope.folderName,
    rootId: scope.folderId,
    tenantKey: options.tenantKey,
    dryRun,
    foldersSeen: 0,
    filesSeen: 0,
    foldersUpserted: 0,
    docsUpserted: 0,
    pagesFetched: 0,
  };

  let syncedRootFolderId: number | null = null;
  if (!dryRun) {
    const rootMeta = await getDriveFileMetadata(conn.refreshToken, scope.folderId);
    const existingRoot = await storage.getKnowledgeFolderByExternalId(options.tenantKey, scope.folderId);
    const rootChanged =
      !existingRoot ||
      existingRoot.title !== rootMeta.name ||
      driveRevisionChanged(existingRoot.driveModifiedAt, rootMeta.modifiedTime);
    const rootIsDirty = rootChanged ? true : (existingRoot?.isDirty ?? true);
    const rootFolder = await storage.upsertKnowledgeFolderByExternalId({
      tenantKey: options.tenantKey,
      connectionId: conn.id,
      parentId: null,
      title: rootMeta.name,
      externalId: scope.folderId,
      isDirty: rootIsDirty,
      driveModifiedAt: driveDateFromIso(rootMeta.modifiedTime),
      syncedAt: new Date(),
    });
    syncedRootFolderId = rootFolder.id;
    stats.foldersUpserted += 1;
  } else {
    stats.foldersUpserted += 1;
  }

  type QueueParent = number | "__dry_root__" | null;
  const queue: Array<{ externalId: string; parentFolderId: QueueParent }> = [
    {
      externalId: scope.folderId,
      parentFolderId: dryRun ? "__dry_root__" : syncedRootFolderId,
    },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { children, pagesFetched } = await walkChildren(conn.refreshToken, current.externalId);
    stats.pagesFetched += pagesFetched;

    for (const child of children) {
      const isFolder = child.mimeType === "application/vnd.google-apps.folder";
      if (isFolder) {
        stats.foldersSeen += 1;
        if (!dryRun) {
          const parentId =
            typeof current.parentFolderId === "number" ? current.parentFolderId : null;
          const existing = await storage.getKnowledgeFolderByExternalId(options.tenantKey, child.id);
          const changed =
            !existing ||
            existing.title !== child.name ||
            (existing.parentId ?? null) !== (parentId ?? null) ||
            driveRevisionChanged(existing.driveModifiedAt, child.modifiedTime);
          const nextIsDirty = changed ? true : (existing?.isDirty ?? true);
          const folder = await storage.upsertKnowledgeFolderByExternalId({
            tenantKey: options.tenantKey,
            connectionId: conn.id,
            parentId: parentId ?? null,
            title: child.name,
            externalId: child.id,
            isDirty: nextIsDirty,
            driveModifiedAt: driveDateFromIso(child.modifiedTime),
            syncedAt: new Date(),
          });
          stats.foldersUpserted += 1;
          if (changed) {
            await storage.markAncestorFoldersDirty(options.tenantKey, folder.id);
          }
          queue.push({ externalId: child.id, parentFolderId: folder.id });
        } else {
          stats.foldersUpserted += 1;
          queue.push({ externalId: child.id, parentFolderId: "__dry_root__" });
        }
      } else {
        stats.filesSeen += 1;
        if (!dryRun) {
          const parentIdNum =
            typeof current.parentFolderId === "number" ? current.parentFolderId : null;
          const { type, category } = classifyDocument(child);
          const existingDoc = await storage.getDriveDocumentByExternalIdAndSource(child.id);
          const changed =
            !existingDoc ||
            existingDoc.title !== child.name ||
            (existingDoc.folderId ?? null) !== (parentIdNum ?? null) ||
            driveRevisionChanged(existingDoc.driveModifiedAt, child.modifiedTime);
          const nextDocStale = changed ? true : (existingDoc?.docSummaryStale ?? false);
          await storage.upsertDriveDocumentByExternalId({
            title: child.name,
            type,
            category,
            externalId: child.id,
            sourceSystem: "gdrive",
            folderId: parentIdNum,
            mediaType: child.mimeType,
            fileSize: child.size ? parseInt(child.size, 10) : null,
            indexed: false,
            processingStatus: "pending",
            driveModifiedAt: driveDateFromIso(child.modifiedTime),
            docSummaryStale: nextDocStale,
          });
          stats.docsUpserted += 1;
          if (changed && parentIdNum !== null) {
            await storage.markFolderAndAncestorsDirty(options.tenantKey, parentIdNum);
          }
        } else {
          stats.docsUpserted += 1;
        }
      }
    }
  }

  if (!dryRun) {
    const freshConn = await storage.getGoogleDriveConnectionForTenant(options.tenantKey);
    const hint = await applyDriveChangeHints(
      options.tenantKey,
      conn.refreshToken,
      freshConn?.driveChangesStartPageToken ?? null,
    );
    stats.driveChangesPages = hint.pages;
  }

  return stats;
}
