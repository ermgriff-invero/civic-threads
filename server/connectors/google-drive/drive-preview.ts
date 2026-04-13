import { driveDebugTimed, type DriveDebugStep } from "./debug";
import { getDriveForRefreshToken } from "./drive-api";
import { extractPdfText } from "../../document-processor/index";

async function timed<T>(steps: DriveDebugStep[] | undefined, name: string, fn: () => Promise<T>): Promise<T> {
  if (!steps) {
    return fn();
  }
  return driveDebugTimed(steps, name, fn);
}

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 80_000;

const GOOGLE_APPS_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export type DrivePreviewResult = {
  fileId: string;
  name: string;
  mimeType: string;
  previewKind: "text" | "empty" | "unsupported";
  text?: string;
  truncated?: boolean;
  note?: string;
};

function truncateText(s: string): { text: string; truncated: boolean } {
  if (s.length <= MAX_TEXT_CHARS) {
    return { text: s, truncated: false };
  }
  return { text: s.slice(0, MAX_TEXT_CHARS) + "\n\n…[truncated]", truncated: true };
}

/**
 * Best-effort text preview for KB 2.0 (Google native → export; plain text → media; PDF → extract).
 */
export async function previewDriveFile(
  refreshToken: string,
  fileId: string,
  steps?: DriveDebugStep[],
): Promise<DrivePreviewResult> {
  const drive = getDriveForRefreshToken(refreshToken);

  const meta = await timed(steps, "files.get(metadata)", () =>
    drive.files.get({
      fileId,
      fields: "id,name,mimeType,size",
      supportsAllDrives: true,
    }),
  );

  const name = meta.data.name ?? "(unnamed)";
  const mimeType = meta.data.mimeType ?? "application/octet-stream";
  const size = meta.data.size ? parseInt(meta.data.size, 10) : undefined;

  if (mimeType === "application/vnd.google-apps.folder") {
    return {
      fileId,
      name,
      mimeType,
      previewKind: "unsupported",
      note: "This is a folder. Open it in the browser tree instead.",
    };
  }

  const exportMime = GOOGLE_APPS_EXPORT_MIME[mimeType];
  if (exportMime) {
    const exported = await timed(steps, `files.export(${exportMime})`, () =>
      drive.files.export({ fileId, mimeType: exportMime }, { responseType: "text" }),
    );
    const raw = typeof exported.data === "string" ? exported.data : String(exported.data ?? "");
    const { text, truncated } = truncateText(raw);
    return {
      fileId,
      name,
      mimeType,
      previewKind: raw.trim() ? "text" : "empty",
      text,
      truncated,
    };
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    if (size != null && size > MAX_DOWNLOAD_BYTES) {
      return {
        fileId,
        name,
        mimeType,
        previewKind: "unsupported",
        note: `File is large (${size} bytes). Max download for preview is ${MAX_DOWNLOAD_BYTES} bytes.`,
      };
    }
    const media = await timed(steps, "files.get(media:text)", () =>
      drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "text" }),
    );
    const raw = typeof media.data === "string" ? media.data : String(media.data ?? "");
    const { text, truncated } = truncateText(raw);
    return {
      fileId,
      name,
      mimeType,
      previewKind: raw.trim() ? "text" : "empty",
      text,
      truncated,
    };
  }

  if (mimeType === "application/pdf") {
    if (size != null && size > MAX_DOWNLOAD_BYTES) {
      return {
        fileId,
        name,
        mimeType,
        previewKind: "unsupported",
        note: `PDF too large for preview (${size} bytes; max ${MAX_DOWNLOAD_BYTES}).`,
      };
    }
    const media = await timed(steps, "files.get(media:pdf)", () =>
      drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" }),
    );
    const buf = Buffer.from(media.data as ArrayBuffer);
    const pdf = await timed(steps, "extractPdfText", async () => extractPdfText(buf));
    if (!pdf.success || !pdf.content) {
      return {
        fileId,
        name,
        mimeType,
        previewKind: "unsupported",
        note: pdf.error ?? "Could not extract PDF text.",
      };
    }
    const { text, truncated } = truncateText(pdf.content);
    return {
      fileId,
      name,
      mimeType,
      previewKind: "text",
      text,
      truncated,
    };
  }

  return {
    fileId,
    name,
    mimeType,
    previewKind: "unsupported",
    note: `No preview for mime type ${mimeType}. Supported: Google Docs/Sheets/Slides export, text/*, JSON, PDF.`,
  };
}
