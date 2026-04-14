/** Short-lived cache for repeated read_document / preview calls in one agent session. */

const DEFAULT_TTL_MS = 60_000;

type CachedPreview = {
  text: string;
  mimeType: string | null;
  previewKind: string;
  truncated: boolean;
  note: string | null;
  expires: number;
};

const store = new Map<string, CachedPreview>();

function ttlMs(): number {
  const raw = parseInt(process.env.SHADOW_TREE_READ_CACHE_TTL_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

export function readDocumentCacheKey(documentId: number, driveModifiedAt: Date | null | undefined): string {
  return `${documentId}:${driveModifiedAt?.getTime() ?? 0}`;
}

export function getCachedReadDocumentPreview(key: string): Omit<CachedPreview, "expires"> | null {
  const row = store.get(key);
  if (!row || row.expires <= Date.now()) {
    if (row) store.delete(key);
    return null;
  }
  return {
    text: row.text,
    mimeType: row.mimeType,
    previewKind: row.previewKind,
    truncated: row.truncated,
    note: row.note,
  };
}

export function setCachedReadDocumentPreview(
  key: string,
  value: Omit<CachedPreview, "expires">,
): void {
  store.set(key, { ...value, expires: Date.now() + ttlMs() });
}

export function clearReadDocumentPreviewCache(): void {
  store.clear();
}
