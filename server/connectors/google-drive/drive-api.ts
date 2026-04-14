import { google } from "googleapis";
import { getGoogleDriveOAuth2Client } from "./oauth-client";

/** Build a Drive v3 client using a stored refresh token (server-side only). */
export function getDriveForRefreshToken(refreshToken: string) {
  const oauth2 = getGoogleDriveOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export type DrivePeekItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
};

export type DriveFileNode = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime?: string;
  size?: string;
};

/**
 * List immediate children of a folder (`parentId` `"root"` = My Drive top level).
 */
export async function listFolderChildren(
  refreshToken: string,
  parentId: string,
  pageSize: number,
): Promise<{ items: DrivePeekItem[]; nextPageToken: string | undefined }> {
  const list = await listFolderChildrenRaw(refreshToken, parentId, pageSize);
  const files = list.files;
  const items: DrivePeekItem[] = files.map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === "application/vnd.google-apps.folder",
  }));

  return { items, nextPageToken: list.nextPageToken };
}

export async function listFolderChildrenRaw(
  refreshToken: string,
  parentId: string,
  pageSize: number,
  pageToken?: string,
): Promise<{ files: DriveFileNode[]; nextPageToken: string | undefined }> {
  const drive = getDriveForRefreshToken(refreshToken);
  const safeParent = parentId === "root" ? "root" : parentId;
  const q =
    safeParent === "root"
      ? "'root' in parents and trashed = false"
      : `'${safeParent}' in parents and trashed = false`;

  const list = await drive.files.list({
    q,
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    pageToken,
    fields: "nextPageToken, files(id, name, mimeType, parents, modifiedTime, size)",
    orderBy: "folder,name_natural",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = (list.data.files ?? []).map((f) => ({
    id: f.id ?? "",
    name: f.name ?? "(unnamed)",
    mimeType: f.mimeType ?? "unknown",
    parents: f.parents ?? [],
    modifiedTime: f.modifiedTime ?? undefined,
    size: f.size ?? undefined,
  }));
  return { files, nextPageToken: list.data.nextPageToken ?? undefined };
}

export async function getDriveAbout(refreshToken: string) {
  const drive = getDriveForRefreshToken(refreshToken);
  const about = await drive.about.get({
    fields: "user(emailAddress, displayName), kind",
  });
  return about.data;
}

export async function resolveRootFolderByExactName(
  refreshToken: string,
  rootFolderName: string,
): Promise<{ folderId: string; folderName: string }> {
  const drive = getDriveForRefreshToken(refreshToken);
  const escaped = rootFolderName.replace(/'/g, "\\'");
  const response = await drive.files.list({
    q: `'root' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escaped}'`,
    fields: "files(id, name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = response.data.files ?? [];
  if (files.length === 0) {
    throw new Error(`Root folder "${rootFolderName}" was not found under My Drive root.`);
  }
  if (files.length > 1) {
    throw new Error(
      `Multiple root folders named "${rootFolderName}" were found. Rename duplicates to continue safely.`,
    );
  }
  return {
    folderId: files[0].id ?? "",
    folderName: files[0].name ?? rootFolderName,
  };
}

export async function getDriveFileMetadata(
  refreshToken: string,
  fileId: string,
): Promise<{ name: string; modifiedTime?: string; mimeType: string }> {
  const drive = getDriveForRefreshToken(refreshToken);
  const r = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, modifiedTime",
    supportsAllDrives: true,
  });
  return {
    name: r.data.name ?? "(unnamed)",
    mimeType: r.data.mimeType ?? "unknown",
    modifiedTime: r.data.modifiedTime ?? undefined,
  };
}

/** Start token for `changes.list` (call when no token stored yet). */
export async function getDriveChangesStartPageToken(refreshToken: string): Promise<string> {
  const drive = getDriveForRefreshToken(refreshToken);
  const r = await drive.changes.getStartPageToken({ supportsAllDrives: true });
  const t = r.data.startPageToken;
  if (!t) throw new Error("Drive changes.getStartPageToken returned no startPageToken.");
  return t;
}

export type DriveChangeEntry = { fileId: string; removed: boolean };

/**
 * One page of Drive changes. Use `newStartPageToken` from the last page as the next baseline.
 */
export async function listDriveChangesPage(
  refreshToken: string,
  pageToken: string,
): Promise<{ changes: DriveChangeEntry[]; nextPageToken?: string; newStartPageToken?: string }> {
  const drive = getDriveForRefreshToken(refreshToken);
  const r = await drive.changes.list({
    pageToken,
    pageSize: 100,
    fields: "nextPageToken, newStartPageToken, changes(fileId, removed)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const raw = r.data.changes ?? [];
  const changes: DriveChangeEntry[] = raw
    .map((c) => ({
      fileId: c.fileId ?? "",
      removed: Boolean(c.removed),
    }))
    .filter((c) => c.fileId.length > 0);
  return {
    changes,
    nextPageToken: r.data.nextPageToken ?? undefined,
    newStartPageToken: r.data.newStartPageToken ?? undefined,
  };
}
