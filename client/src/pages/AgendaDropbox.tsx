import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ClipboardList, Calendar, Plus, Trash2, GripVertical, Check, X,
  MapPin, ChevronRight, ArrowLeft, Loader2, FileText, Clock, Eye
} from "lucide-react";
import { toast } from "sonner";

interface AgendaMeeting {
  id: number;
  title: string;
  meetingDate: string;
  location: string | null;
  description: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
}

interface AgendaItem {
  id: number;
  meetingId: number;
  threadId: number | null;
  title: string;
  description: string | null;
  category: string;
  content: string | null;
  sortOrder: number;
  status: string;
  submittedBy: string;
  notes: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-50 text-yellow-700 border-yellow-200",
  published: "bg-green-50 text-green-700 border-green-200",
  archived: "bg-gray-50 text-gray-500 border-gray-200",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default function AgendaDropbox() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [showCreateMeeting, setShowCreateMeeting] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  if (selectedMeetingId) {
    return (
      <MeetingDetail
        meetingId={selectedMeetingId}
        isAdmin={isAdmin}
        onBack={() => setSelectedMeetingId(null)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-[#FB4F14]" />
          <div>
            <h1 className="text-2xl font-bold text-[#002244]" data-testid="text-agenda-title">Agenda Drop Box</h1>
            <p className="text-sm text-muted-foreground">Build and manage meeting agendas</p>
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowCreateMeeting(true)}
            className="bg-[#FB4F14] hover:bg-[#d9420f]"
            data-testid="button-create-meeting"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Meeting
          </Button>
        )}
      </div>

      <MeetingsList onSelect={setSelectedMeetingId} isAdmin={isAdmin} />

      <CreateMeetingDialog
        open={showCreateMeeting}
        onOpenChange={setShowCreateMeeting}
      />
    </div>
  );
}

function MeetingsList({ onSelect, isAdmin }: { onSelect: (id: number) => void; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data: meetings, isLoading } = useQuery<AgendaMeeting[]>({
    queryKey: ["/api/agenda/meetings"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/agenda/meetings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/meetings"] });
      toast.success("Meeting deleted");
    },
    onError: (err: Error) => toast.error("Failed to delete meeting", { description: err.message }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meetings || meetings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium" data-testid="text-no-meetings">No meetings scheduled</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Create a meeting to start building an agenda."
              : "An admin will create meetings where you can submit agenda items."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const drafts = meetings.filter((m) => m.status === "draft");
  const published = meetings.filter((m) => m.status === "published");
  const archived = meetings.filter((m) => m.status === "archived");

  return (
    <div className="space-y-6">
      {drafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#002244] uppercase tracking-wide">Upcoming (Draft)</h2>
          {drafts.map((m) => (
            <MeetingCard key={m.id} meeting={m} onSelect={onSelect} isAdmin={isAdmin} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
      {published.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide">Published</h2>
          {published.map((m) => (
            <MeetingCard key={m.id} meeting={m} onSelect={onSelect} isAdmin={isAdmin} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Archived</h2>
          {archived.map((m) => (
            <MeetingCard key={m.id} meeting={m} onSelect={onSelect} isAdmin={isAdmin} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  meeting, onSelect, isAdmin, onDelete
}: {
  meeting: AgendaMeeting; onSelect: (id: number) => void; isAdmin: boolean; onDelete: (id: number) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: meeting.status === "published" ? "#22c55e" : "#FB4F14" }}
      onClick={() => onSelect(meeting.id)}
      data-testid={`card-meeting-${meeting.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base text-[#002244] flex items-center gap-2">
              {meeting.title}
              <Badge variant="outline" className={STATUS_COLORS[meeting.status] || ""} data-testid={`badge-meeting-status-${meeting.id}`}>
                {meeting.status}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(meeting.meetingDate).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {meeting.location}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={(e) => { e.stopPropagation(); onDelete(meeting.id); }}
                data-testid={`button-delete-meeting-${meeting.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      {meeting.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{meeting.description}</p>
        </CardContent>
      )}
    </Card>
  );
}

function CreateMeetingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/agenda/meetings", {
        title,
        meetingDate: new Date(meetingDate).toISOString(),
        location: location || null,
        description: description || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/meetings"] });
      toast.success("Meeting created");
      onOpenChange(false);
      setTitle(""); setMeetingDate(""); setLocation(""); setDescription("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[#002244]">Create Meeting</DialogTitle>
          <DialogDescription>Set up a new meeting agenda for your team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Meeting Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. City Council Regular Session" data-testid="input-meeting-title" />
          </div>
          <div>
            <Label>Meeting Date</Label>
            <Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} data-testid="input-meeting-date" />
          </div>
          <div>
            <Label>Location (optional)</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Council Chambers" data-testid="input-meeting-location" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the meeting" data-testid="input-meeting-description" />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title || !meetingDate || createMutation.isPending}
            className="w-full bg-[#FB4F14] hover:bg-[#d9420f]"
            data-testid="button-submit-meeting"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Create Meeting
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetail({ meetingId, isAdmin, onBack }: { meetingId: number; isAdmin: boolean; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);

  const { data: meeting, isLoading: loadingMeeting } = useQuery<AgendaMeeting>({
    queryKey: [`/api/agenda/meetings/${meetingId}`],
  });

  const { data: items = [], isLoading: loadingItems } = useQuery<AgendaItem[]>({
    queryKey: [`/api/agenda/meetings/${meetingId}/items`],
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/agenda/categories"],
  });

  const updateMeetingMutation = useMutation({
    mutationFn: async (updates: Partial<AgendaMeeting>) => {
      const res = await apiRequest("PUT", `/api/agenda/meetings/${meetingId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${meetingId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/agenda/meetings"] });
      toast.success("Meeting updated");
    },
    onError: (err: Error) => toast.error("Failed to update meeting", { description: err.message }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<AgendaItem> }) => {
      const res = await apiRequest("PUT", `/api/agenda/items/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${meetingId}/items`] });
    },
    onError: (err: Error) => toast.error("Failed to update item", { description: err.message }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/agenda/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${meetingId}/items`] });
      toast.success("Item removed");
    },
    onError: (err: Error) => toast.error("Failed to remove item", { description: err.message }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (itemIds: number[]) => {
      const res = await apiRequest("PUT", `/api/agenda/meetings/${meetingId}/reorder`, { itemIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${meetingId}/items`] });
    },
    onError: (err: Error) => toast.error("Failed to reorder items", { description: err.message }),
  });

  const handleDragStart = (itemId: number) => {
    setDraggedItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedItemId === null || draggedItemId === targetId) return;
    const currentOrder = items.map((i) => i.id);
    const dragIndex = currentOrder.indexOf(draggedItemId);
    const targetIndex = currentOrder.indexOf(targetId);
    if (dragIndex === -1 || targetIndex === -1) return;
    const newOrder = [...currentOrder];
    newOrder.splice(dragIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItemId);
    reorderMutation.mutate(newOrder);
    setDraggedItemId(null);
  };

  if (loadingMeeting || loadingItems) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting) return null;

  const groupedItems: Record<string, AgendaItem[]> = {};
  items.forEach((item) => {
    if (!groupedItems[item.category]) groupedItems[item.category] = [];
    groupedItems[item.category].push(item);
  });

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const approvedCount = items.filter((i) => i.status === "approved").length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Button variant="ghost" onClick={onBack} className="text-[#002244] -ml-2" data-testid="button-back-meetings">
        <ArrowLeft className="w-4 h-4 mr-2" />
        All Meetings
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#002244]" data-testid="text-meeting-title">{meeting.title}</h1>
            <Badge variant="outline" className={STATUS_COLORS[meeting.status] || ""}>
              {meeting.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(meeting.meetingDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {meeting.location}
              </span>
            )}
          </div>
          {meeting.description && (
            <p className="text-sm text-muted-foreground mt-2">{meeting.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          {isAdmin && meeting.status === "draft" && (
            <Button
              onClick={() => updateMeetingMutation.mutate({ status: "published" })}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-publish-meeting"
            >
              <Eye className="w-4 h-4 mr-2" />
              Publish
            </Button>
          )}
          {isAdmin && meeting.status === "published" && (
            <Button
              variant="outline"
              onClick={() => updateMeetingMutation.mutate({ status: "archived" })}
              data-testid="button-archive-meeting"
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 py-3 border-y">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-[#002244]" />
          <span className="font-medium">{items.length}</span>
          <span className="text-muted-foreground">items</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-yellow-600" />
          <span className="font-medium">{pendingCount}</span>
          <span className="text-muted-foreground">pending</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check className="w-4 h-4 text-green-600" />
          <span className="font-medium">{approvedCount}</span>
          <span className="text-muted-foreground">approved</span>
        </div>
        <div className="flex-1" />
        {meeting.status === "draft" && (
          <Button onClick={() => setShowAddItem(true)} className="bg-[#FB4F14] hover:bg-[#d9420f]" data-testid="button-add-item">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium" data-testid="text-no-items">No agenda items yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add items to build this meeting's agenda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#002244] flex items-center gap-2">
                <Badge variant="secondary" className="bg-[#002244]/10 text-[#002244]">{category}</Badge>
                <span className="text-muted-foreground font-normal">({categoryItems.length})</span>
              </h3>
              <div className="space-y-2">
                {categoryItems.map((item, idx) => (
                  <Card
                    key={item.id}
                    draggable={isAdmin}
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    className={`transition-all ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${draggedItemId === item.id ? "opacity-50" : ""}`}
                    data-testid={`card-item-${item.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {isAdmin && (
                          <div className="pt-0.5 text-muted-foreground/50">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#002244]">{item.title}</span>
                            <Badge variant="outline" className={ITEM_STATUS_COLORS[item.status] || ""} data-testid={`badge-item-status-${item.id}`}>
                              {item.status}
                            </Badge>
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                          )}
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic mt-1">Note: {item.notes}</p>
                          )}
                        </div>
                        {isAdmin && item.status === "pending" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-800 hover:bg-green-50"
                              onClick={() => updateItemMutation.mutate({ id: item.id, updates: { status: "approved" } })}
                              data-testid={`button-approve-item-${item.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => updateItemMutation.mutate({ id: item.id, updates: { status: "rejected" } })}
                              data-testid={`button-reject-item-${item.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteItemMutation.mutate(item.id)}
                              data-testid={`button-delete-item-${item.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddItemDialog
        open={showAddItem}
        onOpenChange={setShowAddItem}
        meetingId={meetingId}
        categories={categories}
      />
    </div>
  );
}

function AddItemDialog({
  open, onOpenChange, meetingId, categories
}: {
  open: boolean; onOpenChange: (open: boolean) => void; meetingId: number; categories: string[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agenda/meetings/${meetingId}/items`, {
        title,
        description: description || null,
        category: category || "New Business",
        notes: notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/agenda/meetings/${meetingId}/items`] });
      toast.success("Item added to agenda");
      onOpenChange(false);
      setTitle(""); setDescription(""); setCategory(""); setNotes("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[#002244]">Add Agenda Item</DialogTitle>
          <DialogDescription>Submit an item for this meeting's agenda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Item Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rezoning Application - 123 Main St" data-testid="input-item-title" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-item-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {(categories.length > 0 ? categories : ["New Business", "Old Business", "Public Hearing", "Consent Agenda"]).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief summary of this agenda item" data-testid="input-item-description" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for the agenda owner" data-testid="input-item-notes" rows={2} />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!title || createMutation.isPending}
            className="w-full bg-[#FB4F14] hover:bg-[#d9420f]"
            data-testid="button-submit-item"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Add to Agenda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
