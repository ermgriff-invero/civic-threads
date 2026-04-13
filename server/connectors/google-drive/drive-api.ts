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
