import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Bot,
  Send,
  Plus,
  Edit,
  AlertTriangle,
  FileText,
  Users,
  Gavel,
  BookOpen,
  Shield,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  Check,
  X,
  Loader2,
  ExternalLink,
  Lightbulb,
  Target,
  Trash2,
  Link as LinkIcon,
  RefreshCw,
  Upload,
  Search,
  FileUp,
  ScrollText,
} from 'lucide-react';

interface StewardPanelProps {
  threadId: number;
  thread: { id: number; title: string; type: string; status: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ThreadContext {
  completenessScore: number;
  missingItems: string[];
  riskFlags: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; snippet: string; url?: string }[];
  suggestedNextSteps?: string[];
}

interface Suggestion {
  id: number;
  threadId: number;
  type: 'CREATE_NODE' | 'REVISE_NODE' | 'FLAG_RISK' | 'ADD_LINK' | 'ARCHIVE';
  title: string;
  rationale: string;
  priority: number;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
  draftContent?: string;
  targetNodeId?: number;
  nodeKind?: string;
}

interface IdealThreadItem {
  id: string;
  nodeKind: string;
  title: string;
  why: string;
  contentOutline: string;
  defaultIncluded: boolean;
}

const getSuggestionIcon = (type: Suggestion['type']) => {
  switch (type) {
    case 'CREATE_NODE':
      return Plus;
    case 'REVISE_NODE':
      return Edit;
    case 'FLAG_RISK':
      return AlertTriangle;
    case 'ADD_LINK':
      return LinkIcon;
    case 'ARCHIVE':
      return Trash2;
    default:
      return Lightbulb;
  }
};

const getNodeKindIcon = (kind: string) => {
  switch (kind?.toLowerCase()) {
    case 'research':
      return BookOpen;
    case 'draft':
      return FileText;
    case 'decision':
      return Gavel;
    case 'meeting':
      return Users;
    case 'permitreview':
    case 'permit_review':
      return Shield;
    default:
      return FileText;
  }
};

const getHealthColor = (score: number) => {
  if (score > 80) return 'bg-[#FB4F14]';
  if (score >= 50) return 'bg-[#B08D57]';
  return 'bg-[#002244]';
};

const getHealthTextColor = (score: number) => {
  if (score > 80) return 'text-[#C43D0A] dark:text-[#FFA07A]';
  if (score >= 50) return 'text-[#8B6914] dark:text-[#D4A84B]';
  return 'text-[#002244] dark:text-[#6B9AC4]';
};

interface KBDocument {
  id: number;
  title: string;
  type: string;
  processingStatus: string | null;
  extractedContent: string | null;
}

type ResearchMode = 'research' | 'draft';

function ResearchTab({ threadId }: { threadId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDraftMenu, setShowDraftMenu] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [mode, setMode] = useState<ResearchMode>('research');
  const [draftType, setDraftType] = useState<string>('Memo');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch knowledge base documents
  const { data: kbDocuments = [] } = useQuery<KBDocument[]>({
    queryKey: ['/api/documents'],
    queryFn: async () => {
      const res = await fetch('/api/documents', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Filter to only show documents with extracted content (AI-ready)
  const aiReadyDocuments = kbDocuments.filter(
    (d) => d.processingStatus === 'completed' && d.extractedContent
  );

  const toggleDocSelection = (docId: number) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const selectAllDocs = () => {
    setSelectedDocIds(aiReadyDocuments.map((d) => d.id));
  };

  const clearDocSelection = () => {
    setSelectedDocIds([]);
  };

  // Filter documents by search query (matches title or content)
  const filteredDocuments = aiReadyDocuments.filter((doc) => {
    if (docSearchQuery.trim() === '') return true;
    const query = docSearchQuery.toLowerCase();
    const titleMatch = doc.title.toLowerCase().includes(query);
    const contentMatch = doc.extractedContent?.toLowerCase().includes(query);
    return titleMatch || contentMatch;
  });

  // Handle file upload
  const handleFileUpload = async () => {
    if (!uploadFile) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('category', 'research');
      formData.append('description', `Uploaded during research for thread ${threadId}`);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(data.error || 'Upload failed');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadTitle('');
      
      // Add a message indicating the upload
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Document "${uploadTitle || uploadFile.name}" has been uploaded and is being processed. Once ready, it will be available for AI reference.` },
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      setShowUploadDialog(true);
    }
  };

  // Search KB for a keyword and select matching documents
  const searchKnowledgeBase = (query: string) => {
    if (!query.trim()) return;
    
    const matches = aiReadyDocuments.filter((doc) =>
      doc.title.toLowerCase().includes(query.toLowerCase()) ||
      (doc.extractedContent && doc.extractedContent.toLowerCase().includes(query.toLowerCase()))
    );
    
    if (matches.length > 0) {
      setSelectedDocIds(matches.map((d) => d.id));
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Found ${matches.length} document${matches.length !== 1 ? 's' : ''} matching "${query}". They have been selected for focused research.` },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `No documents found matching "${query}". Try a different search term or upload relevant documents.` },
      ]);
    }
  };

  // Load or create research session with existing messages
  useEffect(() => {
    const loadSession = async () => {
      setIsLoadingSession(true);
      try {
        const res = await fetch(`/api/research/${threadId}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load session');
        const data = await res.json();
        setSessionId(data.sessionId);
        
        // Load existing messages from the session
        if (data.messages && data.messages.length > 0) {
          const loadedMessages: ChatMessage[] = data.messages.map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            sources: m.citations || [],
            suggestedNextSteps: m.suggestedNextSteps || [],
          }));
          setMessages(loadedMessages);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load session';
        if (errorMessage.includes('configuration') || errorMessage.includes('API')) {
          setError('AI not configured. Please check your API settings.');
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoadingSession(false);
      }
    };
    
    loadSession();
  }, [threadId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !sessionId) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    setStreamingContent('');
    setError(null);

    try {
      const response = await fetch(`/api/research/${threadId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMessage, sessionId, selectedDocumentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.includes('configuration') || errorText.includes('API')) {
          throw new Error('AI not configured. Please check your API settings.');
        }
        throw new Error(errorText || 'Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let sources: ChatMessage['sources'] = [];
      let suggestedNextSteps: string[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content') {
                  fullContent += data.content;
                  setStreamingContent(fullContent);
                } else if (data.type === 'sources') {
                  sources = data.sources;
                } else if (data.type === 'suggestions') {
                  suggestedNextSteps = data.suggestions;
                }
              } catch {
                fullContent += line.slice(6);
                setStreamingContent(fullContent);
              }
            }
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullContent, sources, suggestedNextSteps },
      ]);
      setStreamingContent('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/steward/${threadId}/suggestions/generate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/steward/${threadId}/suggestions`] });
    },
    onError: (err: Error) => {
      if (err.message.includes('configuration') || err.message.includes('API')) {
        setError('AI not configured. Please check your API settings.');
      } else {
        setError(err.message);
      }
    },
  });

  const handleSuggestionChipClick = (step: string) => {
    setInput(step);
  };

  const handleGenerateDraft = async (draftType: string) => {
    if (!sessionId || messages.length === 0) return;
    
    setGeneratingDraft(draftType);
    setShowDraftMenu(false);
    
    try {
      const res = await fetch(`/api/research/${threadId}/generate-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, draftType }),
        credentials: 'include',
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to generate draft');
      }
      
      const data = await res.json();
      
      // Invalidate thread nodes/edges queries to refresh the canvas
      queryClient.invalidateQueries({ queryKey: [`/api/threads/${threadId}/nodes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/threads/${threadId}/edges`] });
      
      // Add a system message indicating success
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've created a ${draftType} document based on our research conversation. You can find it on the canvas - it's connected to show the research link. The document is fully editable.` 
        },
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate draft';
      setError(errorMessage);
    } finally {
      setGeneratingDraft(null);
    }
  };

  if (error && error.includes('AI not configured')) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Bot className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground" data-testid="text-ai-not-configured">
          {error}
        </p>
      </div>
    );
  }

  if (isLoadingSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Loader2 className="w-8 h-8 animate-spin text-[#FB4F14]" />
        <p className="text-muted-foreground mt-3">Loading research...</p>
      </div>
    );
  }

  // Helper function to clean markdown formatting from AI responses
  const cleanMarkdown = (text: string): string => {
    return text
      .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers (# ## ### etc.)
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold **text**
      .replace(/\*(.+?)\*/g, '$1') // Remove italic *text*
      .replace(/`([^`]+)`/g, '$1') // Remove inline code `text`
      .replace(/^---+$/gm, '') // Remove horizontal rules ---
      .replace(/^-\s+/gm, '• ') // Convert bullet points to simple bullets
      .replace(/^\d+\.\s+/gm, '') // Remove numbered list markers
      .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
      .trim();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1 px-3 py-4" ref={scrollRef}>
        <div className="space-y-4 pr-2">
          {messages.length === 0 && !streamingContent && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-10 h-10 mx-auto mb-3 text-[#FB4F14]" />
              <p data-testid="text-research-empty">Ask me anything about this thread</p>
              {aiReadyDocuments.length > 0 && (
                <p className="text-xs mt-2 flex items-center justify-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {aiReadyDocuments.length} Knowledge Base document{aiReadyDocuments.length !== 1 ? 's' : ''} available
                </p>
              )}
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-lg p-3',
                  msg.role === 'user'
                    ? 'bg-[#FB4F14] text-primary-foreground'
                    : 'bg-muted'
                )}
                data-testid={`message-${msg.role}-${idx}`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{msg.role === 'assistant' ? cleanMarkdown(msg.content) : msg.content}</p>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Sources
                    </p>
                    <div className="space-y-2">
                      {msg.sources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="text-xs bg-background/50 rounded p-2"
                          data-testid={`source-${idx}-${sIdx}`}
                        >
                          <p className="font-medium">{source.title}</p>
                          <p className="text-muted-foreground line-clamp-2">
                            {source.snippet}
                          </p>
                          {source.url && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#FB4F14] hover:underline flex items-center gap-1 mt-1"
                            >
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {msg.suggestedNextSteps && msg.suggestedNextSteps.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Suggested Next Steps
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.suggestedNextSteps.map((step, stepIdx) => (
                        <button
                          key={stepIdx}
                          onClick={() => handleSuggestionChipClick(step)}
                          className="text-xs bg-[#FB4F14]/10 text-[#FB4F14] dark:bg-[#FB4F14]/20 dark:text-[#FFA07A] px-2 py-1 rounded-full hover:bg-[#FB4F14]/20 transition-colors"
                          data-testid={`chip-suggestion-${idx}-${stepIdx}`}
                        >
                          {step}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg p-3 bg-muted">
                <p className="text-sm whitespace-pre-wrap break-words">{cleanMarkdown(streamingContent)}</p>
                <span className="inline-block w-2 h-4 bg-[#FB4F14] animate-pulse ml-1" />
              </div>
            </div>
          )}

          {isLoading && !streamingContent && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <Loader2 className="w-4 h-4 animate-spin text-[#FB4F14]" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t space-y-3">
        {/* Mode Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setMode('research')}
            className={cn(
              "flex-1 text-xs py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors",
              mode === 'research' 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="button-mode-research"
          >
            <Search className="w-3 h-3" />
            Research
          </button>
          <button
            onClick={() => setMode('draft')}
            className={cn(
              "flex-1 text-xs py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors",
              mode === 'draft' 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="button-mode-draft"
          >
            <ScrollText className="w-3 h-3" />
            Draft
          </button>
        </div>

        {/* Knowledge Base Document Selector */}
        <Collapsible open={showDocSelector} onOpenChange={setShowDocSelector}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between text-xs"
              data-testid="button-toggle-doc-selector"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-3 h-3 text-[#002244]" />
                <span className="flex items-center gap-1 text-[#FB4F14]">
                  <Check className="w-3 h-3" />
                  <span className="text-foreground">{aiReadyDocuments.length} KB docs</span>
                </span>
                {selectedDocIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {selectedDocIds.length} selected
                  </Badge>
                )}
              </span>
              {showDocSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="border rounded-lg p-2 bg-muted/50 space-y-2">
              {/* Search and Upload Row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    placeholder="Search documents..."
                    className="h-7 text-xs pl-7"
                    data-testid="input-doc-search"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && docSearchQuery.trim()) {
                        searchKnowledgeBase(docSearchQuery);
                      }
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-doc"
                >
                  <Upload className="w-3 h-3" />
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.mp3,.wav,.m4a,.mp4,.webm,.mov"
                />
              </div>

              {/* Search KB Button */}
              {docSearchQuery.trim() && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => searchKnowledgeBase(docSearchQuery)}
                  data-testid="button-search-kb"
                >
                  <Search className="w-3 h-3 mr-1" />
                  Search KB for "{docSearchQuery}"
                </Button>
              )}

              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">
                  {docSearchQuery ? `${filteredDocuments.length} matching` : 'All documents'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllDocs}
                    className="text-primary hover:underline text-xs"
                    data-testid="button-select-all-docs"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearDocSelection}
                    className="text-muted-foreground hover:underline text-xs"
                    data-testid="button-clear-docs"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredDocuments.length > 0 ? (
                  filteredDocuments.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-xs"
                      data-testid={`doc-selector-${doc.id}`}
                    >
                      <Checkbox
                        checked={selectedDocIds.includes(doc.id)}
                        onCheckedChange={() => toggleDocSelection(doc.id)}
                      />
                      <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{doc.title}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {docSearchQuery ? 'No matching documents' : 'No documents in Knowledge Base'}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1 border-t">
                {selectedDocIds.length > 0 
                  ? `Focusing on ${selectedDocIds.length} document${selectedDocIds.length !== 1 ? 's' : ''}`
                  : "AI will search all documents"}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document to the Knowledge Base for AI reference.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {uploadFile && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <FileUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{uploadFile.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {(uploadFile.size / 1024 / 1024).toFixed(1)} MB
                  </Badge>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Title</label>
                <Input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Enter document title"
                  data-testid="input-upload-title"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleFileUpload} 
                disabled={isUploading || !uploadFile}
                data-testid="button-confirm-upload"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Research Mode Input */}
        {mode === 'research' && (
          <>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedDocIds.length > 0 ? "Ask about the selected documents..." : "Ask about this thread..."}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={isLoading}
                data-testid="input-research-message"
              />
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={() => generateSuggestionsMutation.mutate()}
              disabled={generateSuggestionsMutation.isPending}
              data-testid="button-generate-suggestions"
            >
              {generateSuggestionsMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Suggestions
            </Button>
          </>
        )}

        {/* Draft Mode */}
        {mode === 'draft' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Document Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'Memo', icon: FileText, label: 'Memo' },
                  { type: 'Resolution', icon: ScrollText, label: 'Resolution' },
                  { type: 'Decision', icon: Gavel, label: 'Decision' },
                  { type: 'MeetingMinutes', icon: Users, label: 'Minutes' },
                  { type: 'PermitReview', icon: Shield, label: 'Permit' },
                  { type: 'StaffReport', icon: FileText, label: 'Report' },
                ].map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => setDraftType(type)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors",
                      draftType === type 
                        ? "border-[#FB4F14] bg-[#FB4F14]/10 text-[#FB4F14]" 
                        : "border-border hover:border-[#FB4F14]/50"
                    )}
                    data-testid={`button-draft-type-${type.toLowerCase()}`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Describe what the ${draftType} should cover...`}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                disabled={isLoading}
                data-testid="input-draft-prompt"
              />
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                size="icon"
                data-testid="button-send-draft-prompt"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <Button
              variant="default"
              className="w-full bg-[#FB4F14] hover:bg-[#C43D0A]"
              disabled={messages.length === 0 || !!generatingDraft}
              onClick={() => handleGenerateDraft(draftType)}
              data-testid="button-create-draft"
            >
              {generatingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating {generatingDraft}...
                </>
              ) : (
                <>
                  <ScrollText className="w-4 h-4 mr-2" />
                  Create {draftType}
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionsTab({ threadId }: { threadId: number }) {
  const queryClient = useQueryClient();
  const [expandedRationale, setExpandedRationale] = useState<number | null>(null);
  const [previewSuggestion, setPreviewSuggestion] = useState<Suggestion | null>(null);
  const [acceptSuggestion, setAcceptSuggestion] = useState<Suggestion | null>(null);
  const [dismissSuggestion, setDismissSuggestion] = useState<Suggestion | null>(null);

  const { data: suggestions = [], isLoading, error } = useQuery<Suggestion[]>({
    queryKey: [`/api/steward/${threadId}/suggestions`],
  });

  const activeSuggestions = suggestions
    .filter((s) => s.status === 'PENDING')
    .sort((a, b) => b.priority - a.priority);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest('PATCH', `/api/steward/suggestions/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/steward/${threadId}/suggestions`] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (suggestion: Suggestion) => {
      const res = await apiRequest('POST', `/api/steward/${threadId}/execute`, {
        suggestionId: suggestion.id,
        action: suggestion.type,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/steward/${threadId}/suggestions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/threads/${threadId}/nodes`] });
      setAcceptSuggestion(null);
    },
  });

  const handleAccept = (suggestion: Suggestion) => {
    setAcceptSuggestion(suggestion);
  };

  const handleConfirmAccept = () => {
    if (acceptSuggestion) {
      executeMutation.mutate(acceptSuggestion);
    }
  };

  const handleDismiss = (suggestion: Suggestion) => {
    setDismissSuggestion(suggestion);
  };

  const handleConfirmDismiss = () => {
    if (dismissSuggestion) {
      updateStatusMutation.mutate({ id: dismissSuggestion.id, status: 'DISMISSED' });
      setDismissSuggestion(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[#FB4F14]" />
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load suggestions';
    if (errorMessage.includes('configuration') || errorMessage.includes('API')) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <Bot className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground" data-testid="text-ai-not-configured">
            AI not configured. Please check your API settings.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-muted-foreground">{errorMessage}</p>
      </div>
    );
  }

  if (activeSuggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Lightbulb className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground" data-testid="text-no-suggestions">
          No suggestions yet. Use the Research tab to generate ideas.
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-3">
          {activeSuggestions.map((suggestion) => {
            const Icon = getSuggestionIcon(suggestion.type);
            const isExpanded = expandedRationale === suggestion.id;

            return (
              <Card key={suggestion.id} data-testid={`card-suggestion-${suggestion.id}`} className="border-l-2 border-l-[#002244]">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-[#002244]/10">
                        <Icon className="w-4 h-4 text-[#002244]" />
                      </div>
                      <CardTitle className="text-sm text-[#002244]">{suggestion.title}</CardTitle>
                    </div>
                    <Badge variant="outline" className="shrink-0 bg-[#002244]/10 text-[#002244] border-[#002244]/30">
                      P{suggestion.priority}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="mb-3">
                    <p
                      className={cn(
                        'text-xs text-muted-foreground',
                        !isExpanded && 'line-clamp-2'
                      )}
                    >
                      {suggestion.rationale}
                    </p>
                    {suggestion.rationale.length > 100 && (
                      <button
                        onClick={() =>
                          setExpandedRationale(isExpanded ? null : suggestion.id)
                        }
                        className="text-xs text-[#FB4F14] hover:underline mt-1 flex items-center gap-1"
                        data-testid={`button-expand-rationale-${suggestion.id}`}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> More
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewSuggestion(suggestion)}
                      data-testid={`button-preview-${suggestion.id}`}
                    >
                      <Eye className="w-3 h-3 mr-1" /> Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(suggestion)}
                      data-testid={`button-accept-${suggestion.id}`}
                    >
                      <Check className="w-3 h-3 mr-1" /> Accept
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(suggestion)}
                      data-testid={`button-dismiss-${suggestion.id}`}
                    >
                      <X className="w-3 h-3 mr-1" /> Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <Dialog open={!!previewSuggestion} onOpenChange={() => setPreviewSuggestion(null)}>
        <DialogContent data-testid="dialog-preview">
          <DialogHeader>
            <DialogTitle>Preview: {previewSuggestion?.title}</DialogTitle>
            <DialogDescription>
              This is what will be created if you accept this suggestion.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap">
              {previewSuggestion?.draftContent || 'No draft content available.'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewSuggestion(null)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (previewSuggestion) {
                  handleAccept(previewSuggestion);
                  setPreviewSuggestion(null);
                }
              }}
              data-testid="button-accept-from-preview"
            >
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!acceptSuggestion} onOpenChange={() => setAcceptSuggestion(null)}>
        <AlertDialogContent data-testid="dialog-confirm-accept">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Suggestion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to accept "{acceptSuggestion?.title}"? This will create the
              proposed content in your thread.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-accept">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAccept}
              disabled={executeMutation.isPending}
              data-testid="button-confirm-accept"
            >
              {executeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dismissSuggestion} onOpenChange={() => setDismissSuggestion(null)}>
        <AlertDialogContent data-testid="dialog-confirm-dismiss">
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Suggestion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to dismiss "{dismissSuggestion?.title}"? You can always
              regenerate suggestions later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dismiss">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDismiss}
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-dismiss"
            >
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function IdealThreadTab({ threadId, threadType }: { threadId: number; threadType: string }) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<IdealThreadItem[] | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/steward/${threadId}/ideal-thread/plan`, {
        threadType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPlan(data.items || []);
      const defaultSelected = new Set<string>(
        (data.items || [])
          .filter((item: IdealThreadItem) => item.defaultIncluded)
          .map((item: IdealThreadItem) => item.id)
      );
      setSelectedItems(defaultSelected);
    },
    onError: (err: Error) => {
      if (err.message.includes('configuration') || err.message.includes('API')) {
        setError('AI not configured. Please check your API settings.');
      } else {
        setError(err.message);
      }
    },
  });

  const createNodesMutation = useMutation({
    mutationFn: async (items: IdealThreadItem[]) => {
      const res = await apiRequest('POST', `/api/steward/${threadId}/execute`, {
        action: 'CREATE_IDEAL_THREAD',
        items: items.map((item) => ({
          nodeKind: item.nodeKind,
          title: item.title,
          contentOutline: item.contentOutline,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/threads/${threadId}/nodes`] });
      setPlan(null);
      setSelectedItems(new Set());
    },
  });

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateSelected = () => {
    if (!plan) return;
    const selectedPlanItems = plan.filter((item) => selectedItems.has(item.id));
    createNodesMutation.mutate(selectedPlanItems);
  };

  if (error && error.includes('AI not configured')) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Bot className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground" data-testid="text-ai-not-configured">
          {error}
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Target className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4" data-testid="text-ideal-thread-empty">
          Generate an ideal structure for this {threadType} thread.
        </p>
        <Button
          onClick={() => generatePlanMutation.mutate()}
          disabled={generatePlanMutation.isPending}
          data-testid="button-build-ideal-thread"
        >
          {generatePlanMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Build Ideal Thread for this Type
        </Button>
        {error && !error.includes('AI not configured') && (
          <p className="text-destructive text-sm mt-4">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {plan.map((item) => {
            const Icon = getNodeKindIcon(item.nodeKind);
            const isSelected = selectedItems.has(item.id);
            const isExpanded = expandedItems.has(item.id);

            return (
              <Card
                key={item.id}
                className={cn(!isSelected && 'opacity-60')}
                data-testid={`card-ideal-item-${item.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleItem(item.id)}
                      data-testid={`checkbox-ideal-item-${item.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 rounded bg-muted">
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="font-medium text-sm">{item.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{item.why}</p>

                      <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(item.id)}>
                        <CollapsibleTrigger asChild>
                          <button
                            className="text-xs text-[#FB4F14] hover:underline flex items-center gap-1"
                            data-testid={`button-toggle-outline-${item.id}`}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3 h-3" /> Hide outline
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3" /> Show outline
                              </>
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap">
                            {item.contentOutline}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t space-y-2">
        <Button
          className="w-full"
          onClick={handleCreateSelected}
          disabled={selectedItems.size === 0 || createNodesMutation.isPending}
          data-testid="button-create-selected"
        >
          {createNodesMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Create Selected ({selectedItems.size})
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setPlan(null);
            setSelectedItems(new Set());
            setExpandedItems(new Set());
          }}
          data-testid="button-reset-ideal-thread"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
      </div>
    </div>
  );
}

function PanelContent({
  threadId,
  thread,
}: {
  threadId: number;
  thread: { id: number; title: string; type: string; status: string };
}) {
  const { data: context, isLoading: isContextLoading } = useQuery<ThreadContext>({
    queryKey: [`/api/threads/${threadId}/context`],
  });

  const completenessScore = context?.completenessScore ?? 0;
  const missingItems = context?.missingItems ?? [];
  const riskFlags = context?.riskFlags ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-[#FB4F14]" />
          <span className="font-semibold">AI Steward</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div data-testid="badge-thread-health">
                <Badge
                  className={cn(
                    'cursor-help',
                    getHealthColor(completenessScore),
                    'text-white border-transparent'
                  )}
                >
                  {isContextLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    `${Math.round(completenessScore)}% Complete`
                  )}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-2">
                {missingItems.length > 0 && (
                  <div>
                    <p className="font-semibold text-xs">Missing ({missingItems.length}):</p>
                    <ul className="text-xs list-disc list-inside">
                      {missingItems.slice(0, 3).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                      {missingItems.length > 3 && (
                        <li>+{missingItems.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {riskFlags.length > 0 && (
                  <div>
                    <p className="font-semibold text-xs text-[#B08D57]">
                      Risks ({riskFlags.length}):
                    </p>
                    <ul className="text-xs list-disc list-inside">
                      {riskFlags.slice(0, 3).map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                      {riskFlags.length > 3 && <li>+{riskFlags.length - 3} more</li>}
                    </ul>
                  </div>
                )}
                {missingItems.length === 0 && riskFlags.length === 0 && (
                  <p className="text-xs">Thread looks complete!</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Tabs defaultValue="research" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-2 grid grid-cols-3">
          <TabsTrigger value="research" data-testid="tab-research">
            Research
          </TabsTrigger>
          <TabsTrigger value="suggestions" data-testid="tab-suggestions">
            Suggestions
          </TabsTrigger>
          <TabsTrigger value="ideal" data-testid="tab-ideal">
            Ideal Thread
          </TabsTrigger>
        </TabsList>

        <TabsContent value="research" className="flex-1 min-h-0 mt-0">
          <ResearchTab threadId={threadId} />
        </TabsContent>

        <TabsContent value="suggestions" className="flex-1 min-h-0 mt-0">
          <SuggestionsTab threadId={threadId} />
        </TabsContent>

        <TabsContent value="ideal" className="flex-1 min-h-0 mt-0">
          <IdealThreadTab threadId={threadId} threadType={thread.type} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function StewardPanel({ threadId, thread, open, onOpenChange }: StewardPanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85vh]" data-testid="steward-drawer">
          <DrawerHeader className="sr-only">
            <DrawerTitle>AI Steward</DrawerTitle>
            <DrawerDescription>AI-powered thread assistance</DrawerDescription>
          </DrawerHeader>
          <PanelContent threadId={threadId} thread={thread} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[480px] p-0 flex flex-col"
        data-testid="steward-sheet"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>AI Steward</SheetTitle>
          <SheetDescription>AI-powered thread assistance</SheetDescription>
        </SheetHeader>
        <PanelContent threadId={threadId} thread={thread} />
      </SheetContent>
    </Sheet>
  );
}
