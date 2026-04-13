import { useCallback, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useRoute } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import DocumentRenderer from '@/components/DocumentRenderer';
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Users, 
  Gavel, 
  BookOpen,
  Shield,
  ArrowLeft,
  Share2,
  Save,
  Bot,
  Send,
  X,
  Sparkles,
  Copy,
  Plus,
  Trash2,
  ChevronRight,
  Edit3,
  Download,
  FileDown,
  Clock,
  Wand2,
  Loader2,
  ClipboardList,
  Settings,
  Lock,
  Archive
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import StewardPanel from "@/components/steward/StewardPanel";
import SendToAgendaModal from "@/components/SendToAgendaModal";
import { toast } from "sonner";

type ActionType = 'research' | 'draft' | 'decision' | 'permitReview' | 'meeting';

interface ThreadNodeData {
  id: string;
  threadId: number;
  type: string;
  label: string;
  positionX: number;
  positionY: number;
  deleted: boolean | null;
  data: any;
}

interface ThreadData {
  id: number;
  title: string;
  status: string;
  type: string;
  author: string;
}

const actionIcons: Record<ActionType, React.ReactNode> = {
  research: <BookOpen className="w-4 h-4" />,
  draft: <FileText className="w-4 h-4" />,
  meeting: <Users className="w-4 h-4" />,
  decision: <Gavel className="w-4 h-4" />,
  permitReview: <Shield className="w-4 h-4" />,
};

const actionColors: Record<ActionType, string> = {
  research: "border-l-[#002244] bg-[#002244]/10",
  draft: "border-l-[#B08D57] bg-[#B08D57]/10",
  meeting: "border-l-[#FB4F14] bg-[#FB4F14]/10",
  decision: "border-l-primary bg-primary/10",
  permitReview: "border-l-[#002244] bg-[#002244]/10",
};

const actionLabels: Record<ActionType, string> = {
  research: "Research",
  draft: "Draft",
  meeting: "Meeting",
  decision: "Decision",
  permitReview: "Permit Review",
};

async function parseAiHttpError(response: Response): Promise<string> {
  const ct = response.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const j = await response.json();
      if (typeof j?.error === "string") return j.error;
    } catch {
      /* ignore */
    }
  }
  return `Request failed (${response.status}).`;
}

function assistantErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Check the dev server terminal for details.";
}

export default function ThreadCanvas() {
  const [, params] = useRoute('/thread/:id');
  const threadId = params?.id ? parseInt(params.id) : null;
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [stewardOpen, setStewardOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState("");
  const [writingChatMessages, setWritingChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [writingChatInput, setWritingChatInput] = useState("");
  const [isWritingAiLoading, setIsWritingAiLoading] = useState(false);
  const [writingStreamingResponse, setWritingStreamingResponse] = useState("");

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { data: thread } = useQuery<ThreadData>({
    queryKey: ['/api/threads', threadId],
    enabled: !!threadId,
  });

  const isClosed = thread?.status === "Closed";
  const canWrite = !isClosed;

  const closeThreadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/threads/${threadId}/close`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/threads', threadId] });
      queryClient.invalidateQueries({ queryKey: ['/api/threads'] });
      setShowCloseConfirm(false);
      if (data.archived) {
        toast.success("Thread closed and archived", { description: "Content has been added to the Knowledge Center." });
      } else {
        toast.success("Thread closed", { description: "No content to archive." });
      }
    },
    onError: (err: Error) => toast.error("Failed to close thread", { description: err.message }),
  });

  const { data: apiNodes = [], refetch: refetchNodes } = useQuery<ThreadNodeData[]>({
    queryKey: [`/api/threads/${threadId}/nodes`],
    enabled: !!threadId,
  });

  const activeNodes = apiNodes.filter(n => !n.deleted);
  const selectedNode = activeNodes.find(n => n.id === selectedNodeId);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    setStreamingResponse("");
    setWritingStreamingResponse("");
    if (selectedNode) {
      setEditedContent(selectedNode.data?.content || "");
      setChatMessages(selectedNode.type === 'research' ? (selectedNode.data?.chatMessages || []) : []);
      setWritingChatMessages(selectedNode.type !== 'research' ? (selectedNode.data?.writingChatMessages || []) : []);
    } else {
      setEditedContent("");
      setChatMessages([]);
      setWritingChatMessages([]);
    }
  }, [selectedNodeId]);

  const createNodeMutation = useMutation({
    mutationFn: async (nodeData: { type: string; label: string }) => {
      const res = await apiRequest('POST', `/api/threads/${threadId}/nodes`, {
        type: nodeData.type,
        label: nodeData.label,
        positionX: 0,
        positionY: 0,
      });
      return res.json();
    },
    onSuccess: (data) => {
      refetchNodes();
      setSelectedNodeId(data.id);
      setIsAddingNode(false);
      toast.success("Action added", { description: `${data.label} has been created.` });
    },
    onError: () => {
      setIsAddingNode(false);
      toast.error("Failed to add action");
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await apiRequest('PATCH', `/api/nodes/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      refetchNodes();
      setLastSaved(new Date());
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('PATCH', `/api/nodes/${id}`, { deleted: true });
    },
    onSuccess: () => {
      refetchNodes();
      if (selectedNodeId === deleteNodeId) {
        setSelectedNodeId(null);
      }
      setDeleteNodeId(null);
      toast.success("Action deleted");
    },
  });

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = activeNodes.find(n => n.id === nodeId);
    if (node) {
      setEditedContent(node.data?.content || "");
      setWritingChatMessages(node.type !== 'research' ? (node.data?.writingChatMessages || []) : []);
    }
  };

  const handleSaveContent = () => {
    if (!canWrite) return;
    if (selectedNode) {
      setIsSaving(true);
      updateNodeMutation.mutate({
        id: selectedNode.id,
        updates: {
          data: {
            ...selectedNode.data,
            content: editedContent,
            writingChatMessages: selectedNode.type !== 'research' ? writingChatMessages : undefined,
            updatedAt: new Date().toISOString(),
          },
        },
      }, {
        onSettled: () => setIsSaving(false),
      });
    }
  };

  const addNode = (type: string, label: string) => {
    if (!canWrite || isAddingNode) return;
    setIsAddingNode(true);
    createNodeMutation.mutate({ type, label });
  };

  const sendAiMessage = async () => {
    if (!canWrite || !chatInput.trim() || isAiLoading || !selectedNode) return;
    
    const nodeIdAtStart = selectedNode.id;
    const nodeDataAtStart = selectedNode.data;
    const userMessage = chatInput.trim();
    setChatInput("");
    const newUserMessage = { role: 'user' as const, content: userMessage };
    const updatedMessages = [...chatMessages, newUserMessage];
    setChatMessages(updatedMessages);
    setIsAiLoading(true);
    setStreamingResponse("");

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          threadTitle: thread?.title,
          context: chatMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseAiHttpError(response));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  throw new Error(typeof data.error === "string" ? data.error : "AI request failed");
                }
                if (data.content) {
                  fullResponse += data.content;
                  if (selectedNodeIdRef.current === nodeIdAtStart) {
                    setStreamingResponse(fullResponse);
                  }
                }
                if (data.done) {
                  const newAssistantMessage = { role: 'assistant' as const, content: fullResponse };
                  const finalMessages = [...updatedMessages, newAssistantMessage];
                  
                  if (selectedNodeIdRef.current === nodeIdAtStart) {
                    setChatMessages(finalMessages);
                  }
                  setStreamingResponse("");
                  
                  updateNodeMutation.mutate({
                    id: nodeIdAtStart,
                    updates: {
                      data: {
                        ...nodeDataAtStart,
                        chatMessages: finalMessages,
                        updatedAt: new Date().toISOString(),
                      },
                    },
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = { role: 'assistant' as const, content: assistantErrorMessage(error) };
      const finalMessages = [...updatedMessages, errorMessage];
      
      if (selectedNodeIdRef.current === nodeIdAtStart) {
        setChatMessages(finalMessages);
      }
      
      updateNodeMutation.mutate({
        id: nodeIdAtStart,
        updates: {
          data: {
            ...nodeDataAtStart,
            chatMessages: finalMessages,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } finally {
      setIsAiLoading(false);
      setStreamingResponse("");
    }
  };

  const sendWritingMessage = async () => {
    if (!canWrite || !writingChatInput.trim() || isWritingAiLoading || !selectedNode) return;
    
    const nodeIdAtStart = selectedNode.id;
    const nodeDataAtStart = selectedNode.data;
    const userMessage = writingChatInput.trim();
    setWritingChatInput("");
    const newUserMessage = { role: 'user' as const, content: userMessage };
    const updatedMessages = [...writingChatMessages, newUserMessage];
    setWritingChatMessages(updatedMessages);
    setIsWritingAiLoading(true);
    setWritingStreamingResponse("");

    try {
      const response = await fetch('/api/ai/write-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt: userMessage,
          currentContent: editedContent,
          nodeType: selectedNode.type,
          threadTitle: thread?.title,
          context: writingChatMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseAiHttpError(response));
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  throw new Error(typeof data.error === "string" ? data.error : "AI request failed");
                }
                if (data.content) {
                  fullResponse += data.content;
                  if (selectedNodeIdRef.current === nodeIdAtStart) {
                    setWritingStreamingResponse(fullResponse);
                  }
                }
                if (data.done) {
                  const finalContent = data.fullResponse || fullResponse;
                  const newAssistantMessage = { role: 'assistant' as const, content: finalContent };
                  const finalMessages = [...updatedMessages, newAssistantMessage];
                  
                  if (selectedNodeIdRef.current === nodeIdAtStart) {
                    setWritingChatMessages(finalMessages);
                  }
                  setWritingStreamingResponse("");
                  
                  updateNodeMutation.mutate({
                    id: nodeIdAtStart,
                    updates: {
                      data: {
                        ...nodeDataAtStart,
                        writingChatMessages: finalMessages,
                        updatedAt: new Date().toISOString(),
                      },
                    },
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = { role: 'assistant' as const, content: assistantErrorMessage(error) };
      const finalMessages = [...updatedMessages, errorMessage];
      
      if (selectedNodeIdRef.current === nodeIdAtStart) {
        setWritingChatMessages(finalMessages);
      }

      updateNodeMutation.mutate({
        id: nodeIdAtStart,
        updates: {
          data: {
            ...nodeDataAtStart,
            writingChatMessages: finalMessages,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } finally {
      setIsWritingAiLoading(false);
      setWritingStreamingResponse("");
    }
  };

  const applyAiSuggestion = (suggestion: string) => {
    if (!canWrite) return;
    setEditedContent(prev => {
      const separator = prev && !prev.endsWith('\n\n') ? '\n\n' : '';
      return prev + separator + suggestion;
    });
    toast.success("AI suggestion applied", { description: "Content added to document." });
  };

  const handleExportDocument = async (format: 'word' | 'pdf') => {
    if (!selectedNode || !editedContent.trim()) {
      toast.error("No content to export", { description: "Add some content first." });
      return;
    }
    
    const filename = `${selectedNode.label.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    const content = editedContent;
    
    if (format === 'word') {
      const blob = new Blob([content], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Document exported", { description: `${filename}.doc downloaded` });
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${selectedNode.label}</title>
            <style>
              body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
              h1 { color: #FB4F14; border-bottom: 2px solid #FB4F14; padding-bottom: 10px; }
              .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
              .content { white-space: pre-wrap; }
            </style>
          </head>
          <body>
            <h1>${selectedNode.label}</h1>
            <div class="meta">${thread?.title} • ${new Date().toLocaleDateString()}</div>
            <div class="content">${content}</div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
        toast.success("Print dialog opened", { description: "Save as PDF using your browser's print dialog." });
      }
    }
  };

  return (
    <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col">
      {/* Header */}
      <div className="h-14 border-b bg-background px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/threads">
            <Button variant="ghost" size="icon" className="hover:bg-muted flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm md:text-base flex items-center gap-2 text-[#002244]">
              {thread?.title || 'Loading...'}
              <Badge variant="outline" className={cn(
                "text-xs",
                isClosed ? "bg-red-50 text-red-700 border-red-200" : "bg-[#002244]/10 text-[#002244] border-[#002244]/30"
              )}>
                {isClosed && <Lock className="w-3 h-3 mr-1" />}
                {thread?.status || 'Drafting'}
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground hidden md:block">
              {thread?.type} · {lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Not saved yet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center -space-x-2 mr-2">
            <div className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#002244' }}>JD</div>
            <div className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#B08D57' }}>AS</div>
          </div>
          <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="hidden md:flex" data-testid="button-invite">
                  <Share2 className="w-4 h-4 mr-2" />
                  Invite
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Collaborators</DialogTitle>
                <DialogDescription>
                  Invite colleagues to collaborate on this thread.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-end gap-2">
                  <div className="grid gap-1.5 flex-1">
                    <Label htmlFor="email">Email address</Label>
                    <Input id="email" placeholder="colleague@city.gov" />
                  </div>
                  <Button type="submit">Send</Button>
                </div>
                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Input
                    defaultValue={`https://civicthreads.app/thread/${threadId}`}
                    readOnly
                    className="h-9 text-xs"
                  />
                  <Button type="submit" size="sm" className="px-3">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Link href={`/thread/${threadId}/settings`}>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-[#002244]"
              data-testid="button-project-settings"
            >
              <Settings className="w-4 h-4 md:mr-1" />
              <span className="hidden lg:inline text-xs">Settings</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAgendaOpen(true)}
            className="border-[#002244]/30 text-[#002244] hover:bg-[#002244]/10"
            data-testid="button-send-to-agenda"
          >
            <ClipboardList className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">Send to Agenda</span>
          </Button>
          {!isClosed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCloseConfirm(true)}
              className="border-red-300 text-red-600 hover:bg-red-50"
              data-testid="button-close-thread"
            >
              <Lock className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Close</span>
            </Button>
          )}
          <Button 
            size="sm" 
            onClick={() => setStewardOpen(true)}
            className="bg-[#FB4F14] hover:bg-[#FB4F14]/90 text-white"
            data-testid="button-ai-steward"
          >
            <Bot className="w-4 h-4 md:mr-2" />
            <span className="hidden md:inline">AI Steward</span>
          </Button>
        </div>
      </div>

      {/* Close Thread Confirmation Dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#002244]">
              <Lock className="w-5 h-5" />
              Close Thread
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Closing this thread will:</span>
              <span className="block flex items-center gap-2">
                <Archive className="w-4 h-4 text-[#B08D57]" />
                Archive all content to the Knowledge Center
              </span>
              <span className="block flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-500" />
                Prevent any new sections from being added
              </span>
              <span className="block text-sm mt-2">Existing content will remain viewable but cannot be modified. This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-close">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeThreadMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
              disabled={closeThreadMutation.isPending}
              data-testid="button-confirm-close"
            >
              {closeThreadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              Close Thread
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Closed Thread Banner */}
      {isClosed && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2 text-sm text-red-700" data-testid="banner-thread-closed">
          <Lock className="w-4 h-4" />
          <span className="font-medium">This thread is closed.</span>
          <span className="text-red-600/70">Content is read-only and has been archived to the Knowledge Center.</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Actions List */}
        <div className={cn(
          "border-r bg-muted/30 flex flex-col",
          "w-full md:w-72 lg:w-80",
          selectedNodeId && "hidden md:flex"
        )}>
          <div className="p-3 border-b bg-background">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">Actions</h3>
              <span className="text-xs text-muted-foreground">{activeNodes.length} items</span>
            </div>
            
            {/* Add Action Buttons (PM + Admin only) */}
            {canWrite && (
            <div className="flex flex-wrap gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs"
                    onClick={() => addNode('research', 'New Research')}
                    disabled={isAddingNode}
                  >
                    <BookOpen className="w-3 h-3 mr-1 text-[#002244]" />
                    Research
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add research & references</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs"
                    onClick={() => addNode('draft', 'New Draft')}
                    disabled={isAddingNode}
                  >
                    <FileText className="w-3 h-3 mr-1 text-[#B08D57]" />
                    Draft
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create a document draft</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs"
                    onClick={() => addNode('meeting', 'New Meeting')}
                    disabled={isAddingNode}
                  >
                    <Users className="w-3 h-3 mr-1 text-[#FB4F14]" />
                    Meeting
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Document a meeting</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs"
                    onClick={() => addNode('decision', 'New Decision')}
                    disabled={isAddingNode}
                  >
                    <Gavel className="w-3 h-3 mr-1 text-primary" />
                    Decision
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Record a final decision</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 px-2 text-xs opacity-50 cursor-not-allowed"
                    disabled
                  >
                    <Shield className="w-3 h-3 mr-1 text-[#1a4a70]" />
                    Permit
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">Soon</Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Coming soon - Permit review feature</TooltipContent>
              </Tooltip>
            </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {activeNodes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No actions yet</p>
                  <p className="text-xs mt-1">{canWrite ? "Add your first action above" : "No actions to view"}</p>
                </div>
              ) : (
                activeNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleSelectNode(node.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all border-l-4 group",
                      actionColors[node.type as ActionType] || "border-l-muted bg-muted/50",
                      selectedNodeId === node.id ? "ring-2 ring-primary/30" : "hover:bg-muted"
                    )}
                    data-testid={`action-item-${node.id}`}
                  >
                    <span className="shrink-0">{actionIcons[node.type as ActionType]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{node.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {actionLabels[node.type as ActionType]}
                        {node.data?.content && " · Has content"}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteNodeId(node.id);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Panel - Content View */}
        <div className={cn(
          "flex-1 flex flex-col bg-background overflow-hidden",
          "absolute inset-0 md:relative md:inset-auto",
          !selectedNodeId && "hidden md:flex"
        )}>
          {selectedNode ? (
            <>
              {/* Content Header */}
              <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-3">
                  {/* Mobile back button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8"
                    onClick={() => setSelectedNodeId(null)}
                    data-testid="button-back-to-actions"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className={cn("p-2 rounded-lg", actionColors[selectedNode.type as ActionType])}>
                    {actionIcons[selectedNode.type as ActionType]}
                  </div>
                  <div>
                    <h2 className="font-semibold">{selectedNode.label}</h2>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {actionLabels[selectedNode.type as ActionType]}
                      </Badge>
                      {thread?.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    {selectedNode.type !== 'research' && editedContent.trim() && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleExportDocument('word')}
                              data-testid="button-export-word"
                            >
                              <FileDown className="w-4 h-4" />
                              <span className="hidden md:inline ml-2">Word</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export as Word document</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleExportDocument('pdf')}
                              data-testid="button-export-pdf"
                            >
                              <Download className="w-4 h-4" />
                              <span className="hidden md:inline ml-2">PDF</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Export as PDF</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    <Button 
                      onClick={handleSaveContent}
                      disabled={isSaving || updateNodeMutation.isPending}
                      size="sm"
                      className="bg-primary"
                      data-testid="button-save-content"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedNodeId(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Content Area */}
              <ScrollArea className="flex-1">
                <div className="p-6 max-w-3xl mx-auto space-y-6">
                  {selectedNode.type === 'research' ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Sparkles className="w-4 h-4 text-[#002244]" />
                        Research Assistant
                      </div>
                      
                      {/* Chat Messages */}
                      <div className="space-y-4 min-h-[200px]">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#002244] flex items-center justify-center flex-shrink-0">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                          <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm flex-1">
                            <p>Hi! I'm your research assistant for <strong>{thread?.title}</strong>.</p>
                            <p className="mt-2">What would you like to research?</p>
                            {chatMessages.length === 0 && (
                              <div className="flex flex-wrap gap-2 mt-3">
                                <Badge 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-background text-xs"
                                  onClick={() => setChatInput("Write an executive summary")}
                                >
                                  Executive summary
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-background text-xs"
                                  onClick={() => setChatInput("List key recommendations")}
                                >
                                  Key recommendations
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-background text-xs"
                                  onClick={() => setChatInput("Draft a formal introduction")}
                                >
                                  Formal introduction
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-background text-xs"
                                  onClick={() => setChatInput("Create a community engagement plan for this initiative. Include: 1) Key stakeholder groups to involve, 2) Recommended outreach methods (town halls, surveys, focus groups), 3) Timeline for engagement activities, 4) Key messages and talking points, and 5) How to incorporate community feedback into the decision-making process.")}
                                  data-testid="button-research-community-engagement"
                                >
                                  Community engagement
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className="cursor-pointer hover:bg-background text-xs"
                                  onClick={() => setChatInput("Draft a formal community-facing email about this initiative. The email should: 1) Have a clear, engaging subject line, 2) Open with a friendly greeting appropriate for residents, 3) Summarize the key points and findings from our research, 4) Explain how this affects the community and why it matters, 5) Include any upcoming dates or opportunities for public input, 6) Provide contact information for questions, and 7) Close with a professional yet approachable sign-off.")}
                                  data-testid="button-research-community-email"
                                >
                                  Community email
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        {chatMessages.map((msg, idx) => (
                          <div key={idx} className={cn("flex gap-3", msg.role === 'user' && "flex-row-reverse")}>
                            {msg.role === 'assistant' ? (
                              <div className="w-8 h-8 rounded-lg bg-[#002244] flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                <span className="text-xs text-white font-medium">You</span>
                              </div>
                            )}
                            <div className={cn(
                              "p-3 rounded-lg text-sm max-w-[80%] whitespace-pre-wrap",
                              msg.role === 'assistant' 
                                ? "bg-muted rounded-tl-none" 
                                : "bg-primary text-primary-foreground rounded-tr-none"
                            )}>
                              {msg.content}
                            </div>
                          </div>
                        ))}

                        {streamingResponse && (
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#002244] flex items-center justify-center flex-shrink-0">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm flex-1 whitespace-pre-wrap">
                              {streamingResponse}
                              <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-1" />
                            </div>
                          </div>
                        )}
                      </div>

                      {canWrite && (
                      <div className="flex gap-2 pt-4 border-t">
                        <Input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Ask a research question..."
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendAiMessage()}
                          disabled={isAiLoading}
                        />
                        <Button onClick={sendAiMessage} disabled={isAiLoading || !chatInput.trim()}>
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      {/* Content Editor / Document Preview */}
                      <div className="flex-1 min-h-0">
                        <DocumentRenderer
                          content={editedContent}
                          onChange={(val) => canWrite && setEditedContent(val)}
                          readOnly={!canWrite}
                          nodeType={selectedNode.type}
                          nodeLabel={selectedNode.label}
                          threadTitle={thread?.title}
                        />
                      </div>

                      <Separator className="my-4" />

                      {/* AI Writing Chat */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Wand2 className="w-4 h-4 text-[#B08D57]" />
                          AI Writing Assistant
                        </div>
                        
                        {/* Chat Messages */}
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                          {writingChatMessages.length === 0 && !writingStreamingResponse && (
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#B08D57] flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                              </div>
                              <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm flex-1">
                                <p>I can help you draft and develop this document. Ask me to write sections, improve language, add details, or restructure content.</p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                  <Badge 
                                    variant="outline" 
                                    className="cursor-pointer hover:bg-background text-xs"
                                    onClick={() => setWritingChatInput("Write an executive summary")}
                                  >
                                    Executive summary
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className="cursor-pointer hover:bg-background text-xs"
                                    onClick={() => setWritingChatInput("List key recommendations")}
                                  >
                                    Key recommendations
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className="cursor-pointer hover:bg-background text-xs"
                                    onClick={() => setWritingChatInput("Draft a formal introduction")}
                                  >
                                    Formal introduction
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className="cursor-pointer hover:bg-background text-xs"
                                    onClick={() => setWritingChatInput("Create a community engagement plan for this initiative. Include: 1) Key stakeholder groups to involve, 2) Recommended outreach methods (town halls, surveys, focus groups), 3) Timeline for engagement activities, 4) Key messages and talking points, and 5) How to incorporate community feedback into the decision-making process.")}
                                    data-testid="button-community-engagement"
                                  >
                                    Community engagement
                                  </Badge>
                                  <Badge 
                                    variant="outline" 
                                    className="cursor-pointer hover:bg-background text-xs"
                                    onClick={() => setWritingChatInput("Draft a formal community-facing email about this initiative. The email should: 1) Have a clear, engaging subject line, 2) Open with a friendly greeting appropriate for residents, 3) Summarize the key points and findings from our research, 4) Explain how this affects the community and why it matters, 5) Include any upcoming dates or opportunities for public input, 6) Provide contact information for questions, and 7) Close with a professional yet approachable sign-off.")}
                                    data-testid="button-community-email"
                                  >
                                    Community email
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          )}

                          {writingChatMessages.map((msg, idx) => (
                            <div key={idx} className={cn("flex gap-3", msg.role === 'user' && "flex-row-reverse")}>
                              {msg.role === 'assistant' ? (
                                <div className="w-8 h-8 rounded-lg bg-[#B08D57] flex items-center justify-center flex-shrink-0">
                                  <Bot className="w-4 h-4 text-white" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs text-white font-medium">You</span>
                                </div>
                              )}
                              <div className={cn(
                                "p-3 rounded-lg text-sm max-w-[80%]",
                                msg.role === 'assistant' 
                                  ? "bg-muted rounded-tl-none" 
                                  : "bg-primary text-primary-foreground rounded-tr-none"
                              )}>
                                {msg.role === 'assistant' ? (
                                  <div>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    {canWrite && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="mt-2 text-xs h-7 text-[#B08D57] hover:text-[#B08D57] hover:bg-[#B08D57]/10"
                                      onClick={() => applyAiSuggestion(msg.content)}
                                    >
                                      <Plus className="w-3 h-3 mr-1" />
                                      Add to document
                                    </Button>
                                    )}
                                  </div>
                                ) : (
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                              </div>
                            </div>
                          ))}

                          {writingStreamingResponse && (
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#B08D57] flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-white" />
                              </div>
                              <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm flex-1 whitespace-pre-wrap">
                                {writingStreamingResponse}
                                <span className="inline-block w-2 h-4 bg-[#B08D57]/50 animate-pulse ml-1" />
                              </div>
                            </div>
                          )}
                        </div>

                        {canWrite && (
                        <div className="flex gap-2 pt-2 border-t">
                          <Input
                            value={writingChatInput}
                            onChange={(e) => setWritingChatInput(e.target.value)}
                            placeholder="Ask the AI to help write or improve content..."
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendWritingMessage()}
                            disabled={isWritingAiLoading}
                            data-testid="input-writing-chat"
                          />
                          <Button 
                            onClick={sendWritingMessage} 
                            disabled={isWritingAiLoading || !writingChatInput.trim()}
                            className="bg-[#B08D57] hover:bg-[#B08D57]/90"
                            data-testid="button-send-writing"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                        )}
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
                <p className="text-lg font-medium">Select an action</p>
                <p className="text-sm mt-1">Choose an action from the list to view and edit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNodeId} onOpenChange={(open) => !open && setDeleteNodeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this action?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this action from your thread. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteNodeId && deleteNodeMutation.mutate(deleteNodeId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Steward Panel */}
      <StewardPanel 
        open={stewardOpen} 
        onOpenChange={setStewardOpen} 
        threadId={threadId || 0}
        thread={{
          id: threadId || 0,
          title: thread?.title || '',
          type: thread?.type || '',
          status: thread?.status || 'Drafting'
        }}
      />

      <SendToAgendaModal
        open={agendaOpen}
        onOpenChange={setAgendaOpen}
        threadId={threadId || 0}
        documentTitle={thread?.title || ''}
      />
    </div>
  );
}
