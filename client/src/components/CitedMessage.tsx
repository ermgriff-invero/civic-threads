import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, FileText, ExternalLink } from "lucide-react";

export interface SourceCitation {
  sourceId: string;
  sourceType: "document" | "url";
  sourceTitle: string;
  sourcePage?: number;
  sourceUrl?: string;
}

interface CitedMessageProps {
  content: string;
  citations?: SourceCitation[];
}

interface ParsedSegment {
  type: "text" | "cite";
  value: string;
  citeIndex?: number;
  citation?: SourceCitation;
}

function parseCitedContent(
  content: string,
  citations: SourceCitation[]
): ParsedSegment[] {
  const citationMap = new Map<string, { citation: SourceCitation; index: number }>();
  let counter = 1;
  for (const c of citations) {
    if (!citationMap.has(c.sourceId)) {
      citationMap.set(c.sourceId, { citation: c, index: counter++ });
    }
  }

  const combinedPattern = /(<cite\s+id="([^"]+)"[^>]*\/>|\[\[([A-Z]+-\d+)\]\])/g;

  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }

    const sourceId = match[2] || match[3];
    const mapped = citationMap.get(sourceId);

    if (mapped) {
      segments.push({
        type: "cite",
        value: sourceId,
        citeIndex: mapped.index,
        citation: mapped.citation,
      });
    } else {
      segments.push({ type: "text", value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}

function getSourceUrl(citation: SourceCitation): string | undefined {
  if (citation.sourceType === "url" && citation.sourceUrl) {
    return citation.sourceUrl;
  }
  if (citation.sourceType === "document" && citation.sourceUrl) {
    const page = citation.sourcePage || 1;
    return `${citation.sourceUrl}#page=${page}`;
  }
  return undefined;
}

export function CitedMessage({ content, citations = [] }: CitedMessageProps) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const { segments, uniqueCitations } = useMemo(() => {
    if (!citations || citations.length === 0) {
      return {
        segments: [{ type: "text" as const, value: content }],
        uniqueCitations: [] as Array<SourceCitation & { index: number }>,
      };
    }

    const segs = parseCitedContent(content, citations);

    const seen = new Set<string>();
    const unique: Array<SourceCitation & { index: number }> = [];
    let counter = 1;
    for (const c of citations) {
      if (!seen.has(c.sourceId)) {
        seen.add(c.sourceId);
        unique.push({ ...c, index: counter++ });
      }
    }

    return { segments: segs, uniqueCitations: unique };
  }, [content, citations]);

  const hasCitations = uniqueCitations.length > 0;

  return (
    <div data-testid="cited-message">
      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
        {segments.map((seg, i) =>
          seg.type === "cite" ? (
            <button
              key={i}
              onClick={() => setSourcesExpanded(true)}
              className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 text-[10px] font-semibold rounded bg-[#FB4F14]/15 text-[#FB4F14] hover:bg-[#FB4F14]/25 transition-colors cursor-pointer align-super leading-none"
              title={seg.citation?.sourceTitle}
              data-testid={`cite-badge-${seg.value}`}
            >
              {seg.citeIndex}
            </button>
          ) : (
            <span key={i}>{seg.value}</span>
          )
        )}
      </div>

      {hasCitations && (
        <div className="mt-3 pt-2 border-t border-border/30">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            data-testid="toggle-sources"
          >
            <FileText className="w-3 h-3" />
            <span className="font-medium">
              {uniqueCitations.length} Source{uniqueCitations.length !== 1 ? "s" : ""}
            </span>
            {sourcesExpanded ? (
              <ChevronUp className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-auto" />
            )}
          </button>

          {sourcesExpanded && (
            <div className="mt-2 space-y-1.5" data-testid="sources-list">
              {uniqueCitations.map((cite) => {
                const url = getSourceUrl(cite);
                return (
                  <div
                    key={cite.sourceId}
                    className="flex items-start gap-2 text-xs rounded-md bg-background/60 border border-border/30 px-2.5 py-2"
                    data-testid={`source-item-${cite.sourceId}`}
                  >
                    <span className="mt-0.5 text-sm shrink-0">
                      {cite.sourceType === "document" ? "📄" : "🔗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 text-[9px] font-bold rounded bg-[#FB4F14]/15 text-[#FB4F14] shrink-0">
                          {cite.index}
                        </span>
                        <span className="font-medium text-foreground truncate">
                          {cite.sourceTitle}
                        </span>
                      </div>
                      {cite.sourcePage && (
                        <span className="text-muted-foreground mt-0.5 block">
                          Page {cite.sourcePage}
                        </span>
                      )}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[#FB4F14] hover:text-[#FB4F14]/80 transition-colors shrink-0 mt-0.5"
                        data-testid={`source-link-${cite.sourceId}`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="text-[10px] font-medium">View</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
