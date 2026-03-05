import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, CheckCircle2, Trash2, Plus, Send, Sparkles, ArrowRight, Loader2, User, Bot } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThreads } from "@/hooks/useThreads";
import { useAuth } from "@/hooks/use-auth";
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

interface SummaryAction {
  type: "view_thread" | "start_thread";
  label: string;
  threadId?: number;
  suggestedTitle?: string;
  suggestedType?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: SummaryAction[];
  isStreaming?: boolean;
}

const NetworkBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <svg className="w-full h-full opacity-[0.03]" width="100%" height="100%">
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="currentColor" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        <motion.path
          d="M100,100 Q400,200 600,100 T1000,300"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        />
        <motion.path
          d="M-100,600 Q200,400 500,600 T900,400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 4, delay: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        />
         <motion.circle 
           cx="600" 
           cy="100" 
           r="6" 
           fill="currentColor"
           animate={{ r: [4, 8, 4], opacity: [0.5, 1, 0.5] }}
           transition={{ duration: 2, repeat: Infinity }}
         />
      </svg>
    </div>
  );
};

export default function TheBrain() {
  const { threads, deleteThread } = useThreads();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteTitle, setDeleteTitle] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const recentThreads = threads.slice(0, 3);

  const handleDeleteClick = (e: React.MouseEvent, id: number, title: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteId(id);
    setDeleteTitle(title);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteThread(deleteId);
      setDeleteId(null);
      setDeleteTitle("");
    }
  };
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };
  
  const userName = user?.firstName || "there";

  const suggestions = [
    "Draft a resolution for...",
    "Summarize the last meeting about...",
    "Find precedents for...",
    "What threads are in progress?"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: message
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history })
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let accumulated = "";
      let actions: SummaryAction[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "token" && data.content) {
                accumulated += data.content;
                setMessages(prev => prev.map(m => 
                  m.id === assistantId 
                    ? { ...m, content: accumulated }
                    : m
                ));
              } else if (data.type === "actions" && data.actions) {
                actions = data.actions;
              } else if (data.type === "done") {
                setMessages(prev => prev.map(m => 
                  m.id === assistantId 
                    ? { ...m, isStreaming: false, actions }
                    : m
                ));
              } else if (data.type === "error") {
                setMessages(prev => prev.map(m => 
                  m.id === assistantId 
                    ? { ...m, content: data.error || "An error occurred. Please try again.", isStreaming: false }
                    : m
                ));
              }
            } catch (e) {
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { ...m, content: "I apologize, but I encountered an error. Please try again.", isStreaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    textareaRef.current?.focus();
  };

  const handleActionClick = (action: SummaryAction) => {
    if (action.type === "view_thread" && action.threadId) {
      navigate(`/thread/${action.threadId}`);
    } else if (action.type === "start_thread") {
      const params = new URLSearchParams();
      if (action.suggestedTitle) params.set("title", action.suggestedTitle);
      if (action.suggestedType) params.set("type", action.suggestedType);
      navigate(`/thread/new?${params.toString()}`);
    }
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="relative min-h-full p-4 md:p-8 space-y-8 pb-24">
      <NetworkBackground />

      <section className={cn(
        "space-y-6 max-w-4xl mx-auto flex flex-col items-center transition-all duration-500",
        hasConversation ? "pt-4" : "pt-8 md:pt-16 text-center"
      )}>
        <AnimatePresence mode="wait">
          {!hasConversation && (
            <motion.div
              key="greeting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-2"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
                <Sparkles className="w-3 h-3" />
                <span>Civic Threads AI</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground" data-testid="text-greeting">
                {getGreeting()}, {userName}.
              </h1>
              <p className="text-xl text-muted-foreground font-light">
                How can I help you govern today?
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {hasConversation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-2xl space-y-4 max-h-[50vh] overflow-y-auto px-2"
          >
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  message.role === "user" 
                    ? "bg-primary text-primary-foreground text-right" 
                    : "bg-muted/50 text-foreground text-left"
                )}>
                  <p className="text-sm whitespace-pre-wrap" data-testid={`chat-message-${message.id}`}>
                    {message.content}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-1" />
                    )}
                  </p>
                  
                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={action.type === "start_thread" ? "default" : "outline"}
                          className="h-8 text-xs"
                          onClick={() => handleActionClick(action)}
                          data-testid={`action-button-${action.type}-${idx}`}
                        >
                          {action.type === "view_thread" ? (
                            <>
                              <FileText className="w-3 h-3 mr-1" />
                              {action.label}
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3 mr-1" />
                              {action.label}
                            </>
                          )}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {message.role === "user" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </motion.div>
        )}

        <motion.div 
          className={cn(
            "w-full max-w-2xl relative group",
            hasConversation ? "mt-4" : "mt-8"
          )}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative bg-background/80 backdrop-blur-xl border border-primary/20 shadow-xl rounded-3xl overflow-hidden transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-2xl">
            <div className="p-4">
              <textarea 
                ref={textareaRef}
                placeholder="Ask Civic Threads anything..."
                className="w-full bg-transparent border-none outline-none text-lg placeholder:text-muted-foreground/50 text-foreground resize-none min-h-[60px] max-h-[200px]"
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={(e) => {
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                }}
                disabled={isLoading}
                data-testid="input-chat"
              />
            </div>
            
            <div className="px-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors">
                    <FileText className="w-4 h-4" />
                 </Button>
              </div>
              <Button 
                size="icon" 
                className="rounded-full h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim()}
                data-testid="button-send"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 ml-0.5" />
                )}
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {!hasConversation && (
              <motion.div 
                className="mt-4 flex flex-wrap justify-center gap-2"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {suggestions.map((suggestion, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + (i * 0.1) }}
                    className="px-4 py-2 rounded-full bg-background/50 border hover:bg-background hover:border-primary/30 text-xs md:text-sm text-muted-foreground transition-all cursor-pointer shadow-sm"
                    onClick={() => handleSuggestionClick(suggestion)}
                    data-testid={`suggestion-${i}`}
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      <AnimatePresence>
        {!hasConversation && (
          <motion.section 
            className="max-w-6xl mx-auto space-y-4 pt-8"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-[#002244]">
                <Clock className="w-5 h-5 text-[#002244]" />
                Recent Activity
              </h2>
              <Link href="/threads">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/5" data-testid="button-view-all">
                  View All
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentThreads.map((thread, index) => (
                <Link key={thread.id} href={`/thread/${thread.id}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + (index * 0.1) }}
                  >
                    <Card className="hover:shadow-lg transition-all duration-300 hover:border-[#002244]/50 cursor-pointer group bg-background/60 backdrop-blur-sm border-l-4 border-l-[#002244]" data-testid={`thread-card-${thread.id}`}>
                      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                        <Badge variant="outline" className={cn(
                          "bg-opacity-10 font-bold border-0 px-2 py-0.5",
                          thread.status === "Drafting" ? "bg-[#B08D57] text-[#5c4728] dark:text-[#d4b896]" :
                          thread.status === "In Review" ? "bg-[#002244] text-[#002244] dark:text-[#6B9AC4]" :
                          "bg-[#FB4F14] text-[#7a2608] dark:text-[#FFA07A]"
                        )}>
                          {thread.status}
                        </Badge>
                        <button
                          onClick={(e) => handleDeleteClick(e, thread.id, thread.title)}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                          data-testid={`delete-thread-${thread.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                        </button>
                      </CardHeader>
                      <CardContent>
                        <h3 className="font-bold text-xl leading-tight mb-3 text-[#002244] group-hover:text-primary transition-colors">
                          {thread.title}
                        </h3>
                        <div className="flex items-center text-sm font-medium text-foreground/80 gap-4">
                          <span className="flex items-center gap-1.5 bg-[#002244]/10 px-2 py-1 rounded-md">
                            <FileText className="w-4 h-4 text-[#002244]" />
                            {thread.type}
                          </span>
                          <span className="text-muted-foreground">{thread.date}</span>
                        </div>
                        {thread.outcome && (
                          <div className="mt-4 pt-3 border-t flex items-center gap-2 text-sm font-bold text-[#C43D0A] dark:text-[#FFA07A]">
                            <CheckCircle2 className="w-4 h-4" />
                            Outcome: {thread.outcome}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                </Link>
              ))}
              
              <Link href="/thread/new">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Card className="h-full border-dashed border-2 border-[#002244]/30 hover:border-[#002244] hover:bg-[#002244]/5 cursor-pointer transition-all flex flex-col items-center justify-center p-6 text-[#002244]/60 hover:text-[#002244] min-h-[180px] group" data-testid="card-new-thread">
                    <div className="h-12 w-12 rounded-full bg-[#002244]/10 group-hover:bg-[#002244]/20 flex items-center justify-center mb-3 transition-colors">
                      <Plus className="w-6 h-6" />
                    </div>
                    <span className="font-medium">Start New Thread</span>
                  </Card>
                </motion.div>
              </Link>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Thread</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTitle}"? This action cannot be undone and will remove all associated data.
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
