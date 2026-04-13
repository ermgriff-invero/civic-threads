import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Settings } from "lucide-react";
import { Link } from "wouter";
import KnowledgeGatePanel from "@/components/KnowledgeGatePanel";

interface Thread {
  id: number;
  title: string;
  type: string;
  status: string;
}

export default function ProjectSettings() {
  const [, params] = useRoute("/thread/:id/settings");
  const threadId = params?.id ? parseInt(params.id) : 0;

  const { data: thread, isLoading } = useQuery<Thread>({
    queryKey: [`/api/threads/${threadId}`],
    enabled: threadId > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href={`/thread/${threadId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back-to-thread">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-[#002244] flex items-center gap-2" data-testid="text-project-settings-title">
              <Settings className="w-5 h-5" />
              Project Settings
            </h1>
            <p className="text-xs text-muted-foreground">{thread?.title || "Loading..."}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <KnowledgeGatePanel projectId={threadId} />
      </div>
    </div>
  );
}
