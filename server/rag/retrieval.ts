import { storage } from "../storage";

export interface SourceChunk {
  sourceId: string;
  sourceType: "document" | "url";
  sourceTitle: string;
  sourcePage?: number;
  sourceUrl?: string;
  content: string;
}

export interface SourceMetadata {
  sourceId: string;
  sourceType: "document" | "url";
  sourceTitle: string;
  sourcePage?: number;
  sourceUrl?: string;
}

function splitIntoChunks(text: string, maxChunkSize: number = 2000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

function estimatePage(fullText: string, chunkStart: number): number {
  const textBefore = fullText.substring(0, chunkStart);
  const pageBreaks = (textBefore.match(/\f/g) || []).length;
  if (pageBreaks > 0) return pageBreaks + 1;
  return Math.floor(chunkStart / 3000) + 1;
}

export async function retrieveSourceChunks(): Promise<SourceChunk[]> {
  const chunks: SourceChunk[] = [];

  const documents = await storage.getDocuments();
  for (const doc of documents) {
    const content = doc.extractedContent || doc.content;
    if (!content) continue;

    const textChunks = splitIntoChunks(content);
    let offset = 0;
    for (const chunkText of textChunks) {
      const page = estimatePage(content, offset);
      chunks.push({
        sourceId: `DOC-${doc.id}`,
        sourceType: "document",
        sourceTitle: doc.title,
        sourcePage: page,
        sourceUrl: doc.filePath || undefined,
        content: chunkText,
      });
      offset += chunkText.length + 2;
    }
  }

  const links = await storage.getKnowledgeLinks();
  for (const link of links) {
    const content = link.description;
    if (!content) continue;

    const textChunks = splitIntoChunks(content);
    for (const chunkText of textChunks) {
      chunks.push({
        sourceId: `URL-${link.id}`,
        sourceType: "url",
        sourceTitle: link.title,
        sourceUrl: link.url,
        content: chunkText,
      });
    }
  }

  return chunks;
}

export function formatChunksForPrompt(chunks: SourceChunk[]): string {
  if (chunks.length === 0) return "";

  let formatted = "\n\n=== VERIFIED SOURCES ===\n";
  formatted += "Each source below is labeled with a SOURCE_ID. You MUST use these IDs in your citations.\n\n";

  for (const chunk of chunks) {
    const pageInfo = chunk.sourcePage ? `, p.${chunk.sourcePage}` : "";
    const urlInfo = chunk.sourceUrl ? ` (${chunk.sourceUrl})` : "";
    formatted += `[SOURCE: ${chunk.sourceTitle}${pageInfo}${urlInfo}] [ID: ${chunk.sourceId}]\n`;
    formatted += `${chunk.content}\n\n`;
  }

  return formatted;
}

export function buildSourcesMap(chunks: SourceChunk[]): Map<string, SourceMetadata> {
  const map = new Map<string, SourceMetadata>();
  for (const chunk of chunks) {
    if (!map.has(chunk.sourceId)) {
      map.set(chunk.sourceId, {
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        sourceTitle: chunk.sourceTitle,
        sourcePage: chunk.sourcePage,
        sourceUrl: chunk.sourceUrl,
      });
    }
  }
  return map;
}
