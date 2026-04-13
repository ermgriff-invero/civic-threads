import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Eye, Edit3, FileText } from "lucide-react";

interface DocumentRendererProps {
  content: string;
  onChange?: (content: string) => void;
  readOnly?: boolean;
  nodeType?: string;
  nodeLabel?: string;
  threadTitle?: string;
}

function parseDocumentContent(content: string, nodeType?: string, nodeLabel?: string) {
  const lines = content.split('\n');
  const sections: Array<{ type: string; content: string; level?: number }> = [];

  let headerBlock: string[] = [];
  let inHeader = true;
  let bodyStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inHeader && !bodyStarted) {
      const headerMatch = trimmed.match(/^(TO|FROM|DATE|SUBJECT|RE|CC|MEETING DATE|LOCATION|ATTENDEES|APPLICATION|APPLICANT|PROJECT|PERMIT NO|REVIEW DATE):\s*(.*)/i);
      if (headerMatch) {
        headerBlock.push(trimmed);
        continue;
      }
      if (trimmed === '' && headerBlock.length > 0) {
        continue;
      }
      if (headerBlock.length > 0 || trimmed === '---') {
        inHeader = false;
        bodyStarted = true;
        if (headerBlock.length > 0) {
          sections.push({ type: 'header-block', content: headerBlock.join('\n') });
          headerBlock = [];
        }
        if (trimmed === '---') continue;
      }
      if (trimmed === '' && headerBlock.length === 0) {
        continue;
      }
      inHeader = false;
      bodyStarted = true;
    }

    if (trimmed.match(/^#{1,3}\s+/)) {
      const level = trimmed.match(/^(#{1,3})/)?.[1].length || 1;
      const text = trimmed.replace(/^#{1,3}\s+/, '');
      sections.push({ type: 'heading', content: text, level });
    } else if (trimmed.match(/^\*\*[^*]+\*\*$/)) {
      sections.push({ type: 'heading', content: trimmed.replace(/\*\*/g, ''), level: 2 });
    } else if (trimmed.match(/^\*\*[^*]+\*\*:/)) {
      sections.push({ type: 'bold-label', content: trimmed });
    } else if (trimmed.match(/^[-•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      const lastSection = sections[sections.length - 1];
      if (lastSection && lastSection.type === 'list') {
        lastSection.content += '\n' + trimmed;
      } else {
        sections.push({ type: 'list', content: trimmed });
      }
    } else if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      sections.push({ type: 'divider', content: '' });
    } else if (trimmed === '') {
      sections.push({ type: 'spacer', content: '' });
    } else {
      sections.push({ type: 'paragraph', content: trimmed });
    }
  }

  if (headerBlock.length > 0) {
    sections.unshift({ type: 'header-block', content: headerBlock.join('\n') });
  }

  return sections;
}

function renderInlineFormatting(text: string) {
  const parts: Array<{ type: string; text: string }> = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const italicMatch = remaining.match(/\*([^*]+)\*/);
    const citeMatch = remaining.match(/\[\[([^\]]+)\]\]/);
    
    let firstMatch: { index: number; length: number; type: string; inner: string } | null = null;
    
    if (boldMatch && boldMatch.index !== undefined) {
      firstMatch = { index: boldMatch.index, length: boldMatch[0].length, type: 'bold', inner: boldMatch[1] };
    }
    if (italicMatch && italicMatch.index !== undefined && (!firstMatch || italicMatch.index < firstMatch.index)) {
      if (!boldMatch || italicMatch.index !== boldMatch.index) {
        firstMatch = { index: italicMatch.index, length: italicMatch[0].length, type: 'italic', inner: italicMatch[1] };
      }
    }
    if (citeMatch && citeMatch.index !== undefined && (!firstMatch || citeMatch.index < firstMatch.index)) {
      firstMatch = { index: citeMatch.index, length: citeMatch[0].length, type: 'cite', inner: citeMatch[1] };
    }
    
    if (!firstMatch) {
      parts.push({ type: 'text', text: remaining });
      break;
    }
    
    if (firstMatch.index > 0) {
      parts.push({ type: 'text', text: remaining.substring(0, firstMatch.index) });
    }
    parts.push({ type: firstMatch.type, text: firstMatch.inner });
    remaining = remaining.substring(firstMatch.index + firstMatch.length);
  }
  
  return parts.map((part, i) => {
    if (part.type === 'bold') return <strong key={i} className="font-semibold">{part.text}</strong>;
    if (part.type === 'italic') return <em key={i} className="italic">{part.text}</em>;
    if (part.type === 'cite') return <sup key={i} className="text-[#FB4F14] font-medium text-[10px] cursor-help" title={part.text}>[{part.text}]</sup>;
    return <span key={i}>{part.text}</span>;
  });
}

export default function DocumentRenderer({ content, onChange, readOnly = false, nodeType, nodeLabel, threadTitle }: DocumentRendererProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>(content ? 'preview' : 'edit');

  if (!content && mode === 'preview') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-base font-medium">
            <FileText className="w-4 h-4" />
            Document
          </div>
        </div>
        <Textarea
          value={content}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder="Enter your content here, or use the AI assistant below to help you develop this document..."
          className="min-h-[200px] text-base leading-relaxed resize-y flex-1"
          data-testid="textarea-content"
        />
      </div>
    );
  }

  const sections = parseDocumentContent(content, nodeType, nodeLabel);

  const getDocTypeLabel = () => {
    switch (nodeType) {
      case 'draft': return 'MEMORANDUM';
      case 'decision': return 'DECISION DOCUMENT';
      case 'meeting': return 'MEETING MINUTES';
      case 'permitReview': return 'PERMIT REVIEW';
      case 'research': return 'RESEARCH BRIEF';
      default: return 'DOCUMENT';
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="document-renderer">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-base font-medium">
          <FileText className="w-4 h-4" />
          Document
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant={mode === 'preview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('preview')}
              className="h-7 px-3 text-xs"
              data-testid="button-preview-mode"
            >
              <Eye className="w-3 h-3 mr-1" />
              Preview
            </Button>
            <Button
              variant={mode === 'edit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMode('edit')}
              className="h-7 px-3 text-xs"
              data-testid="button-edit-mode"
            >
              <Edit3 className="w-3 h-3 mr-1" />
              Edit
            </Button>
          </div>
        )}
      </div>

      {mode === 'edit' ? (
        <Textarea
          value={content}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder="Enter your content here, or use the AI assistant below to help you develop this document..."
          className="min-h-[200px] text-base leading-relaxed resize-y flex-1 font-mono"
          data-testid="textarea-content"
        />
      ) : (
        <div className="flex-1 overflow-y-auto" data-testid="document-preview">
          <div className="bg-white border border-gray-200 shadow-md rounded-sm mx-auto" style={{ maxWidth: '720px', fontFamily: "'Georgia', 'Times New Roman', serif" }}>
            <div className="border-b-[3px] border-[#002244] px-8 pt-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.2em] text-[#B08D57] font-sans font-semibold uppercase">
                    {threadTitle || 'Civic Threads'}
                  </div>
                  <h1 className="text-lg font-bold text-[#002244] mt-1 tracking-tight">
                    {getDocTypeLabel()}
                  </h1>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#002244] flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>

            <div className="px-8 py-6 space-y-0 text-[14px] leading-[1.7] text-gray-800">
              {sections.map((section, i) => {
                if (section.type === 'header-block') {
                  const headerLines = section.content.split('\n');
                  return (
                    <div key={i} className="bg-gray-50 border border-gray-200 rounded px-5 py-4 mb-6 font-sans">
                      {headerLines.map((hl, j) => {
                        const [label, ...rest] = hl.split(':');
                        const value = rest.join(':').trim();
                        return (
                          <div key={j} className="flex gap-2 py-1 text-[13px]">
                            <span className="font-bold text-[#002244] uppercase tracking-wide min-w-[80px]">{label}:</span>
                            <span className="text-gray-700">{value}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                if (section.type === 'heading') {
                  if (section.level === 1) {
                    return (
                      <h2 key={i} className="text-[17px] font-bold text-[#002244] mt-6 mb-2 pb-1 border-b border-[#002244]/20 tracking-tight font-sans">
                        {section.content}
                      </h2>
                    );
                  }
                  if (section.level === 2) {
                    return (
                      <h3 key={i} className="text-[15px] font-bold text-[#002244] mt-5 mb-2 font-sans">
                        {section.content}
                      </h3>
                    );
                  }
                  return (
                    <h4 key={i} className="text-[14px] font-semibold text-[#002244]/80 mt-4 mb-1 font-sans">
                      {section.content}
                    </h4>
                  );
                }

                if (section.type === 'bold-label') {
                  return (
                    <p key={i} className="mt-3 mb-1">
                      {renderInlineFormatting(section.content)}
                    </p>
                  );
                }

                if (section.type === 'list') {
                  const items = section.content.split('\n');
                  const isOrdered = items[0]?.match(/^\d+\.\s+/);
                  
                  if (isOrdered) {
                    return (
                      <ol key={i} className="list-decimal list-outside ml-6 mb-3 space-y-1.5">
                        {items.map((item, j) => (
                          <li key={j} className="text-gray-800 pl-1">
                            {renderInlineFormatting(item.replace(/^\d+\.\s+/, ''))}
                          </li>
                        ))}
                      </ol>
                    );
                  }
                  return (
                    <ul key={i} className="list-disc list-outside ml-6 mb-3 space-y-1.5">
                      {items.map((item, j) => (
                        <li key={j} className="text-gray-800 pl-1">
                          {renderInlineFormatting(item.replace(/^[-•]\s+/, ''))}
                        </li>
                      ))}
                    </ul>
                  );
                }

                if (section.type === 'divider') {
                  return <hr key={i} className="border-t border-gray-300 my-4" />;
                }

                if (section.type === 'spacer') {
                  return <div key={i} className="h-2" />;
                }

                return (
                  <p key={i} className="mb-3 text-justify">
                    {renderInlineFormatting(section.content)}
                  </p>
                );
              })}
            </div>

            <div className="border-t border-gray-200 px-8 py-3">
              <div className="flex items-center justify-between text-[10px] text-gray-400 font-sans">
                <span>Generated by Civic Threads</span>
                <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
