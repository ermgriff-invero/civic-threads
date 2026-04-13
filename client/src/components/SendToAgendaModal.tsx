import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

interface AgendaMeeting {
  id: number;
  title: string;
  meetingDate: string;
  status: string;
}

interface SendToAgendaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: number;
  documentTitle: string;
  documentContent?: string;
}

export default function SendToAgendaModal({ open, onOpenChange, threadId, documentTitle, documentContent }: SendToAgendaModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(documentTitle);
  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (documentTitle && open) {
      setTitle(documentTitle);
    }
  }, [documentTitle, open]);

  const { data: meetings } = useQuery<AgendaMeeting[]>({
    queryKey: ["/api/agenda/meetings"],
    enabled: open,
  });

  const { data: categories } = useQuery<string[]>({
    queryKey: ["/api/agenda/categories"],
    enabled: open,
  });

  const draftMeetings = meetings?.filter((m) => m.status === "draft") || [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      const meetingId = parseInt(selectedMeetingId);
      const res = await apiRequest("POST", `/api/agenda/meetings/${meetingId}/items`, {
        title,
        threadId,
        category: category || "New Business",
        description: documentContent ? documentContent.slice(0, 200) : null,
        content: documentContent || null,
        notes: notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      const meeting = draftMeetings.find((m) => m.id === parseInt(selectedMeetingId));
      const meetingName = meeting ? meeting.title : "meeting";
      toast.success(`Added to ${meetingName} agenda`);
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${selectedMeetingId}/items`] });
      onOpenChange(false);
      setNotes("");
      setSelectedMeetingId("");
      setCategory("");
    },
    onError: (error: any) => {
      toast.error("Failed to submit", { description: error.message });
    },
  });

  const canSubmit = title.trim() && selectedMeetingId && category;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#FB4F14]" />
            <DialogTitle>Send to Agenda</DialogTitle>
          </div>
          <DialogDescription>
            Drop this document into a meeting agenda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter document title"
              data-testid="input-agenda-title"
            />
          </div>

          <div className="space-y-2">
            <Label>Target Meeting</Label>
            {draftMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                No draft meetings available. An admin needs to create a meeting first.
              </p>
            ) : (
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger data-testid="select-target-meeting">
                  <SelectValue placeholder="Select a meeting..." />
                </SelectTrigger>
                <SelectContent>
                  {draftMeetings.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.title} — {new Date(m.meetingDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="agenda-category" data-testid="select-agenda-category">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {(categories || ["New Business", "Old Business", "Public Hearing", "Consent Agenda"]).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clerk-notes">Notes (optional)</Label>
            <Textarea
              id="clerk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for the agenda owner..."
              rows={3}
              data-testid="input-clerk-notes"
            />
          </div>

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending}
            className="w-full bg-[#FB4F14] hover:bg-[#FB4F14]/90 text-white"
            data-testid="button-confirm-send"
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ClipboardList className="w-4 h-4 mr-2" />
            )}
            Add to Agenda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
