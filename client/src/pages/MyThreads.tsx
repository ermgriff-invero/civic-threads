import { useState } from "react";
import { useLocation } from "wouter";
import { FileText, CheckCircle2, Trash2, Clock, Plus, Sparkles, MessageCircle, User, Bot, Calendar, Gavel, ClipboardCheck, ChevronRight, Edit3, ExternalLink, Link2, FileStack, X, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThreads } from "@/hooks/useThreads";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ResearchSession, ResearchMessage, ThreadNode } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type ActionType = 'research' | 'draft' | 'meeting' | 'decision' | 'permitReview';

interface ActionItem {
  id: string;
  type: ActionType;
  label: string;
  threadId: number;
  threadTitle: string;
  content?: string;
  citations?: Array<{url: string; title: string; snippet: string}>;
  data?: any;
}

const actionIcons: Record<ActionType, React.ReactNode> = {
  research: <Sparkles className="w-4 h-4" />,
  draft: <FileText className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  decision: <Gavel className="w-4 h-4" />,
  permitReview: <ClipboardCheck className="w-4 h-4" />,
};

const actionLabels: Record<ActionType, string> = {
  research: "Research",
  draft: "Draft",
  meeting: "Meeting",
  decision: "Decision",
  permitReview: "Permit Review",
};

export default function MyThreads() {
  const { threads, deleteThread } = useThreads();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteTitle, setDeleteTitle] = useState<string>("");
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [newCitationUrl, setNewCitationUrl] = useState("");
  const [newCitationTitle, setNewCitationTitle] = useState("");
  const [localCitations, setLocalCitations] = useState<Array<{url: string; title: string; snippet: string}>>([]);
  const [selectedForCombine, setSelectedForCombine] = useState<Set<string>>(new Set());
  const [combineMode, setCombineMode] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<number>>(new Set());
  
  const activeThreads = threads.filter(t => t.status !== "Decided");
  const decidedThreads = threads.filter(t => t.status === "Decided");
  const allThreadsSorted = [...activeThreads, ...decidedThreads];

  const { data: allThreadNodes } = useQuery({
    queryKey: ["all-thread-nodes", threads.map(t => t.id).join(",")],
    queryFn: async (): Promise<Record<number, ThreadNode[]>> => {
      const nodesMap: Record<number, ThreadNode[]> = {};
      await Promise.all(
        threads.map(async (thread) => {
          try {
            const res = await fetch(`/api/threads/${thread.id}/nodes`, { credentials: "include" });
            if (res.ok) {
              const nodes: ThreadNode[] = await res.json();
              nodesMap[thread.id] = nodes.filter(n => !n.deleted);
            } else {
              nodesMap[thread.id] = [];
            }
          } catch {
            nodesMap[thread.id] = [];
          }
        })
      );
      return nodesMap;
    },
    enabled: threads.length > 0,
  });

  const { data: allResearchSessions } = useQuery({
    queryKey: ["all-research-sessions", threads.map(t => t.id).join(",")],
    queryFn: async (): Promise<Record<number, ResearchSession[]>> => {
      const sessionsMap: Record<number, ResearchSession[]> = {};
      await Promise.all(
        threads.map(async (thread) => {
          try {
            const res = await fetch(`/api/research/${thread.id}/sessions`, { credentials: "include" });
            if (res.ok) {
              const sessions: ResearchSession[] = await res.json();
              sessionsMap[thread.id] = sessions;
            } else {
              sessionsMap[thread.id] = [];
            }
          } catch {
            sessionsMap[thread.id] = [];
          }
        })
      );
      return sessionsMap;
    },
    enabled: threads.length > 0,
  });

  const { data: selectedResearchMessages } = useQuery({
    queryKey: ["research-messages-for-action", selectedAction?.id, selectedAction?.threadId],
    queryFn: async (): Promise<ResearchMessage[]> => {
      if (!selectedAction || selectedAction.type !== 'research') return [];
      const sessions = allResearchSessions?.[selectedAction.threadId];
      if (!sessions?.length) return [];
      const latestSession = sessions[0];
      const res = await fetch(`/api/research/${selectedAction.threadId}/sessions/${latestSession.id}/messages`, { credentials: "include" });
      if (res.ok) {
        return await res.json();
      }
      return [];
    },
    enabled: !!selectedAction && selectedAction.type === 'research' && !!allResearchSessions?.[selectedAction.threadId]?.length,
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({ nodeId, content, citations }: { nodeId: string; content: string; citations: Array<{url: string; title: string; snippet: string}> }) => {
      return apiRequest('PATCH', `/api/nodes/${nodeId}`, { 
        data: { 
          content, 
          citations,
          updatedAt: new Date().toISOString()
        } 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-thread-nodes"] });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async ({ title, content, sourceActionIds }: { title: string; content: string; sourceActionIds: string[] }) => {
      return apiRequest('POST', `/api/documents`, { 
        title,
        type: "Combined Document",
        category: "Thread Outputs",
        content,
        description: `Combined from ${sourceActionIds.length} actions`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const handleDeleteClick = (e: React.MouseEvent, id: number, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteId(id);
    setDeleteTitle(title);
  };

  const handleActionClick = (action: ActionItem) => {
    if (combineMode) {
      toggleSelectForCombine(action.id);
    } else {
      setSelectedAction(action);
      setEditedContent(action.content || (action.data as any)?.content || "");
      setLocalCitations(action.citations || (action.data as any)?.citations || []);
    }
  };

  const handleSaveAction = () => {
    if (selectedAction) {
      updateNodeMutation.mutate({
        nodeId: selectedAction.id,
        content: editedContent,
        citations: localCitations,
      });
    }
  };

  const handleAddCitation = () => {
    if (newCitationUrl.trim() && newCitationTitle.trim()) {
      setLocalCitations([...localCitations, { url: newCitationUrl, title: newCitationTitle, snippet: "" }]);
      setNewCitationUrl("");
      setNewCitationTitle("");
    }
  };

  const handleRemoveCitation = (index: number) => {
    setLocalCitations(localCitations.filter((_, i) => i !== index));
  };

  const getThreadActions = (threadId: number, threadTitle: string): ActionItem[] => {
    const nodes = allThreadNodes?.[threadId] || [];
    return nodes.map(node => ({
      id: node.id,
      type: node.type as ActionType,
      label: node.label,
      threadId,
      threadTitle,
      content: (node.data as any)?.content,
      citations: (node.data as any)?.citations,
      data: node.data,
    }));
  };

  const getAllActions = (): ActionItem[] => {
    const allActions: ActionItem[] = [];
    threads.forEach(thread => {
      allActions.push(...getThreadActions(thread.id, thread.title));
    });
    return allActions;
  };

  const toggleSelectForCombine = (actionId: string) => {
    const newSet = new Set(selectedForCombine);
    if (newSet.has(actionId)) {
      newSet.delete(actionId);
    } else {
      newSet.add(actionId);
    }
    setSelectedForCombine(newSet);
  };

  const toggleThreadExpanded = (threadId: number) => {
    const newSet = new Set(expandedThreads);
    if (newSet.has(threadId)) {
      newSet.delete(threadId);
    } else {
      newSet.add(threadId);
    }
    setExpandedThreads(newSet);
  };

  const getSelectedActionsForCombine = (): ActionItem[] => {
    const allActions = getAllActions();
    return allActions.filter(a => selectedForCombine.has(a.id));
  };

  const generateCombinedDocument = () => {
    const selected = getSelectedActionsForCombine();
    let combinedContent = "";
    const combinedCitations: Array<{url: string; title: string; snippet: string}> = [];
    
    selected.forEach((action, index) => {
      const content = action.content || (action.data as any)?.content || "";
      const citations = action.citations || (action.data as any)?.citations || [];
      
      if (index > 0) combinedContent += "\n\n---\n\n";
      combinedContent += `## ${action.label} (${actionLabels[action.type]})\n\n${content}`;
      
      citations.forEach((c: any) => {
        if (!combinedCitations.find(cc => cc.url === c.url)) {
          combinedCitations.push(c);
        }
      });
    });
    
    return { content: combinedContent, citations: combinedCitations };
  };

  const handleCreateCombinedDocument = async () => {
    const { content, citations } = generateCombinedDocument();
    const sourceActionIds = Array.from(selectedForCombine);
    const selectedActions = getSelectedActionsForCombine();
    const title = `Combined: ${selectedActions.map(a => a.label).slice(0, 3).join(", ")}${selectedActions.length > 3 ? "..." : ""}`;
    
    try {
      await createDocumentMutation.mutateAsync({
        title,
        content: content + (citations.length > 0 ? `\n\n## References\n\n${citations.map(c => `- [${c.title}](${c.url})`).join("\n")}` : ""),
        sourceActionIds,
      });
      
      setSelectedAction({
        id: 'combined-saved',
        type: 'draft',
        label: title,
        threadId: 0,
        threadTitle: 'Saved to Knowledge Base',
        content,
        citations,
      });
      setEditedContent(content);
      setLocalCitations(citations);
      setCombineMode(false);
      setSelectedForCombine(new Set());
      
      toast.success("Document saved to Knowledge Base", {
        description: `"${title}" has been created from ${sourceActionIds.length} actions.`,
        action: {
          label: "View",
          onClick: () => window.location.href = "/knowledge",
        },
      });
    } catch (error) {
      console.error("Failed to save combined document:", error);
      toast.error("Failed to save document", {
        description: "There was an error saving the combined document. Please try again.",
      });
    }
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteThread(deleteId);
      setDeleteId(null);
      setDeleteTitle("");
    }
  };

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      {/* Left Panel - Thread & Action List */}
      <div className="w-full md:w-80 lg:w-96 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b bg-background">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold tracking-tight">My Threads</h1>
            <Link href="/thread/new">
              <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-new-thread">
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant={combineMode ? "default" : "outline"} 
              size="sm" 
              className="flex-1 text-xs"
              onClick={() => {
                setCombineMode(!combineMode);
                if (combineMode) setSelectedForCombine(new Set());
              }}
              data-testid="button-combine-mode"
            >
              <Link2 className="w-3 h-3 mr-1" />
              {combineMode ? "Cancel" : "Link Actions"}
            </Button>
            {combineMode && selectedForCombine.size >= 2 && (
              <Button 
                size="sm" 
                className="text-xs bg-[#FB4F14]"
                onClick={handleCreateCombinedDocument}
                disabled={createDocumentMutation.isPending}
                data-testid="button-create-combined"
              >
                <FileStack className="w-3 h-3 mr-1" />
                {createDocumentMutation.isPending ? "Saving..." : `Create (${selectedForCombine.size})`}
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {/* Active Threads */}
            {activeThreads.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-[#002244] uppercase tracking-wider">
                  <Clock className="w-3 h-3 text-[#002244]" />
                  Active ({activeThreads.length})
                </div>
                {activeThreads.map((thread) => {
                  const actions = getThreadActions(thread.id, thread.title);
                  const isExpanded = expandedThreads.has(thread.id);
                  return (
                    <div key={thread.id} className="mb-1">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleThreadExpanded(thread.id)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                          data-testid={`thread-item-${thread.id}`}
                        >
                          <ChevronRight className={cn("w-4 h-4 transition-transform text-muted-foreground", isExpanded && "rotate-90")} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{thread.title}</div>
                            <div className="text-xs text-muted-foreground">{thread.type} · {actions.length} actions</div>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0 bg-[#002244]/10 text-[#002244] border-[#002244]/30">
                            {thread.status}
                          </Badge>
                        </button>
                        <button
                          onClick={() => navigate(`/thread/${thread.id}`)}
                          className="p-2 rounded-lg hover:bg-[#002244]/10 transition-colors"
                          title="Open thread canvas"
                          data-testid={`open-thread-${thread.id}`}
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-[#002244]" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, thread.id, thread.title)}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                          data-testid={`delete-thread-${thread.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      
                      {isExpanded && actions.length > 0 && (
                        <div className="ml-6 pl-2 border-l space-y-0.5">
                          {actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={() => handleActionClick(action)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all text-left",
                                selectedAction?.id === action.id && !combineMode ? "bg-primary/10 text-primary" : "hover:bg-muted",
                                combineMode && selectedForCombine.has(action.id) && "bg-[#FB4F14]/20 ring-1 ring-[#FB4F14]"
                              )}
                              data-testid={`action-item-${action.id}`}
                            >
                              {combineMode && (
                                <Checkbox 
                                  checked={selectedForCombine.has(action.id)}
                                  className="pointer-events-none"
                                />
                              )}
                              <span className="opacity-70">{actionIcons[action.type]}</span>
                              <span className="flex-1 truncate">{action.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed Threads */}
            {decidedThreads.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" />
                  Completed ({decidedThreads.length})
                </div>
                {decidedThreads.map((thread) => {
                  const actions = getThreadActions(thread.id, thread.title);
                  const isExpanded = expandedThreads.has(thread.id);
                  return (
                    <div key={thread.id} className="mb-1 opacity-80">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleThreadExpanded(thread.id)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                          data-testid={`thread-item-${thread.id}`}
                        >
                          <ChevronRight className={cn("w-4 h-4 transition-transform text-muted-foreground", isExpanded && "rotate-90")} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{thread.title}</div>
                            <div className="text-xs text-muted-foreground">{actions.length} actions</div>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0 bg-[#FB4F14]/20 text-[#FB4F14] border-0">
                            <Check className="w-3 h-3 mr-1" />
                            Done
                          </Badge>
                        </button>
                        <button
                          onClick={() => navigate(`/thread/${thread.id}`)}
                          className="p-2 rounded-lg hover:bg-[#002244]/10 transition-colors"
                          title="Open thread canvas"
                          data-testid={`open-thread-${thread.id}`}
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-[#002244]" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, thread.id, thread.title)}
                          className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                          data-testid={`delete-thread-${thread.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      
                      {isExpanded && actions.length > 0 && (
                        <div className="ml-6 pl-2 border-l space-y-0.5">
                          {actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={() => handleActionClick(action)}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all text-left",
                                selectedAction?.id === action.id && !combineMode ? "bg-primary/10 text-primary" : "hover:bg-muted",
                                combineMode && selectedForCombine.has(action.id) && "bg-[#FB4F14]/20 ring-1 ring-[#FB4F14]"
                              )}
                              data-testid={`action-item-${action.id}`}
                            >
                              {combineMode && (
                                <Checkbox 
                                  checked={selectedForCombine.has(action.id)}
                                  className="pointer-events-none"
                                />
                              )}
                              <span className="opacity-70">{actionIcons[action.type]}</span>
                              <span className="flex-1 truncate">{action.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {threads.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No threads yet.</p>
                <Link href="/thread/new">
                  <Button variant="link" className="text-primary mt-2 text-sm">Start a new one</Button>
                </Link>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Content View */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedAction ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  {actionIcons[selectedAction.type]}
                </div>
                <div>
                  <h2 className="font-semibold text-lg">{selectedAction.label}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {actionLabels[selectedAction.type]}
                    </Badge>
                    {selectedAction.threadTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedAction.type !== 'research' && (
                  <Button 
                    onClick={handleSaveAction}
                    disabled={updateNodeMutation.isPending}
                    size="sm"
                    className="bg-primary"
                    data-testid="button-save-action"
                  >
                    {updateNodeMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedAction(null)}
                  data-testid="button-close-action"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-4xl mx-auto">
                {selectedAction.type === 'research' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                      <MessageCircle className="w-4 h-4" />
                      Research Conversation
                    </div>
                    {selectedResearchMessages && selectedResearchMessages.length > 0 ? (
                      <div className="space-y-4">
                        {selectedResearchMessages.map((message) => (
                          <div
                            key={message.id}
                            className={cn(
                              "flex gap-3",
                              message.role === "user" ? "justify-end" : "justify-start"
                            )}
                          >
                            {message.role === "assistant" && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#7C9885]/20 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-[#FB4F14]" />
                              </div>
                            )}
                            <div
                              className={cn(
                                "max-w-[80%] rounded-lg p-4",
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              )}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              {(() => {
                                const citations = message.citations as Array<{title: string; url: string; snippet: string}> | null;
                                if (citations && Array.isArray(citations) && citations.length > 0) {
                                  return (
                                    <div className="mt-3 pt-3 border-t border-border/50">
                                      <p className="text-xs font-medium mb-2 opacity-70">Sources:</p>
                                      <div className="space-y-1">
                                        {citations.map((citation, i) => (
                                          <a
                                            key={i}
                                            href={citation.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            {citation.title}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {message.role === "user" && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <User className="w-4 h-4 text-primary" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg">
                        <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No research messages found.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Content Editor */}
                    <div>
                      <Label className="flex items-center gap-2 mb-3 text-base font-medium">
                        <Edit3 className="w-4 h-4" />
                        Content
                      </Label>
                      <Textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        placeholder="Enter your content here..."
                        className="min-h-[300px] text-base leading-relaxed resize-y"
                        data-testid="textarea-content"
                      />
                    </div>

                    <Separator />

                    {/* Citations Section */}
                    <div>
                      <Label className="flex items-center gap-2 mb-3 text-base font-medium">
                        <ExternalLink className="w-4 h-4" />
                        Citations & References
                      </Label>
                      
                      {localCitations.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {localCitations.map((citation, index) => (
                            <div 
                              key={index} 
                              className="flex items-center gap-2 p-3 bg-muted rounded-lg group"
                            >
                              <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <a 
                                  href={citation.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-primary hover:underline block truncate"
                                >
                                  {citation.title}
                                </a>
                                <p className="text-xs text-muted-foreground truncate">{citation.url}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveCitation(index)}
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                                data-testid={`remove-citation-${index}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          placeholder="Citation title"
                          value={newCitationTitle}
                          onChange={(e) => setNewCitationTitle(e.target.value)}
                          className="flex-1"
                          data-testid="input-citation-title"
                        />
                        <Input
                          placeholder="URL"
                          value={newCitationUrl}
                          onChange={(e) => setNewCitationUrl(e.target.value)}
                          className="flex-1"
                          data-testid="input-citation-url"
                        />
                        <Button 
                          variant="outline" 
                          onClick={handleAddCitation}
                          disabled={!newCitationUrl.trim() || !newCitationTitle.trim()}
                          data-testid="button-add-citation"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Select an action to view</p>
              <p className="text-sm mt-1">Click on any action from the list to see its content</p>
              {combineMode && (
                <p className="text-sm mt-4 text-primary">
                  Select multiple actions to combine them into a single document
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Thread</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTitle}"? This action cannot be undone and will remove all associated nodes, edges, and research data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
