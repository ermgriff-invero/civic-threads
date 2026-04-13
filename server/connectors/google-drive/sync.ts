import { storage } from "../../storage";
import {
  listFolderChildrenRaw,
  resolveRootFolderByExactName,
  type DriveFileNode,
} from "./drive-api";

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

  type QueueNode = { externalId: string; parentFolderId: number | null };
  let syncedRootFolderId: number | null = null;
  if (!dryRun) {
    const rootFolder = await storage.upsertKnowledgeFolderByExternalId({
      tenantKey: options.tenantKey,
      connectionId: conn.id,
      parentId: null,
      title: scope.folderName,
      externalId: scope.folderId,
      isDirty: true,
      syncedAt: new Date(),
    });
    syncedRootFolderId = rootFolder.id;
    stats.foldersUpserted += 1;
  } else {
    // Dry run still counts root as a folder that would be upserted.
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
          const folder = await storage.upsertKnowledgeFolderByExternalId({
            tenantKey: options.tenantKey,
            connectionId: conn.id,
            parentId: current.parentFolderId,
            title: child.name,
            externalId: child.id,
            isDirty: true,
            syncedAt: new Date(),
          });
          stats.foldersUpserted += 1;
          queue.push({ externalId: child.id, parentFolderId: folder.id });
        } else {
          stats.foldersUpserted += 1;
          queue.push({ externalId: child.id, parentFolderId: "__dry_root__" });
        }
      } else {
        stats.filesSeen += 1;
        if (!dryRun) {
          const { type, category } = classifyDocument(child);
          await storage.upsertDriveDocumentByExternalId({
            title: child.name,
            type,
            category,
            externalId: child.id,
            sourceSystem: "gdrive",
            folderId:
              typeof current.parentFolderId === "number" ? current.parentFolderId : null,
            mediaType: child.mimeType,
            fileSize: child.size ? parseInt(child.size, 10) : null,
            indexed: false,
            processingStatus: "pending",
          });
          stats.docsUpserted += 1;
        } else {
          stats.docsUpserted += 1;
        }
      }
    }
  }

  return stats;
}
