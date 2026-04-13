import type { SourceMetadata } from "./retrieval";

export interface ParsedCitation {
  sourceId: string;
  sourceType: "document" | "url";
  sourceTitle: string;
  sourcePage?: number;
  sourceUrl?: string;
}

export interface CitationResult {
  annotatedText: string;
  citations: ParsedCitation[];
}

export function parseClaudeCitations(
  response: string,
  sourcesUsed: Map<string, SourceMetadata>
): CitationResult {
  const citationPattern = /\[\[([A-Z]+-\d+)\]\]/g;
  const foundCitations: ParsedCitation[] = [];
  const seenIds = new Set<string>();

  let match;
  while ((match = citationPattern.exec(response)) !== null) {
    const sourceId = match[1];
    if (!seenIds.has(sourceId)) {
      seenIds.add(sourceId);
      const source = sourcesUsed.get(sourceId);
      if (source) {
        foundCitations.push({
          sourceId: source.sourceId,
          sourceType: source.sourceType,
          sourceTitle: source.sourceTitle,
          sourcePage: source.sourcePage,
          sourceUrl: source.sourceUrl,
        });
      }
    }
  }

  const verifiedIds = new Set(foundCitations.map(c => c.sourceId));

  const annotatedText = response.replace(
    citationPattern,
    (_match, sourceId) => {
      if (verifiedIds.has(sourceId)) {
        const source = sourcesUsed.get(sourceId)!;
        const pageAttr = source.sourcePage ? ` data-page="${source.sourcePage}"` : "";
        const urlAttr = source.sourceUrl ? ` data-url="${source.sourceUrl}"` : "";
        return `<cite id="${sourceId}" data-source="${source.sourceTitle}"${pageAttr}${urlAttr} />`;
      }
      return `[[${sourceId}]]`;
    }
  );

  return {
    annotatedText,
    citations: foundCitations,
  };
}

export const CITATION_SYSTEM_PROMPT = `
CITATION REQUIREMENTS (MANDATORY):
- You have access to verified sources labeled with SOURCE_IDs (e.g., DOC-42, URL-7).
- Every factual claim in your response MUST end with an inline citation marker: [[SOURCE_ID]]
- Example: "The 2024 budget allocated $2.1M to infrastructure [[DOC-42]]."
- If a claim draws from multiple sources, cite all: "Revenue increased 15% [[DOC-12]] while costs decreased [[URL-3]]."
- Do NOT fabricate source IDs. Only use IDs that appear in the VERIFIED SOURCES section.
- If you cannot attribute a claim to any provided source, clearly mark it as general knowledge without a citation marker.
- Prefer citing provided sources over making unsourced claims.
`;
