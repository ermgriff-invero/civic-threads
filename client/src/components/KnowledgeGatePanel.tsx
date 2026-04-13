import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Save, Loader2, FileText, Link2, X, Filter } from "lucide-react";
import { toast } from "sonner";

const ALL_CATEGORIES = ["Budget", "Statute", "Ordinance", "Policy", "Meeting Minutes", "Other"];

const categoryIcons: Record<string, string> = {
  Budget: "💰",
  Statute: "⚖️",
  Ordinance: "📜",
  Policy: "📋",
  "Meeting Minutes": "📝",
  Other: "📁",
};

interface KnowledgeGatePanelProps {
  projectId: number;
}

interface KnowledgeConfig {
  id: number;
  projectId: number;
  enabledCategories: string[] | null;
  yearFrom: number | null;
  yearTo: number | null;
  enabledTags: string[] | null;
  updatedAt: string;
}

export default function KnowledgeGatePanel({ projectId }: KnowledgeGatePanelProps) {
  const queryClient = useQueryClient();
  const [enabledCategories, setEnabledCategories] = useState<string[]>(ALL_CATEGORIES);
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");
  const [enabledTags, setEnabledTags] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery<KnowledgeConfig | null>({
    queryKey: [`/api/projects/${projectId}/knowledge-config`],
  });

  const { data: allTags } = useQuery<string[]>({
    queryKey: ["/api/knowledge/tags"],
  });

  const { data: stats, refetch: refetchStats } = useQuery<{ documentCount: number; urlCount: number }>({
    queryKey: ["/api/knowledge/stats", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/knowledge/stats?projectId=${projectId}`, { credentials: "include" });
      return res.json();
    },
  });

  useEffect(() => {
    if (config) {
      setEnabledCategories(config.enabledCategories || ALL_CATEGORIES);
      setYearFrom(config.yearFrom ? String(config.yearFrom) : "");
      setYearTo(config.yearTo ? String(config.yearTo) : "");
      setEnabledTags(config.enabledTags || []);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/projects/${projectId}/knowledge-config`, {
        enabledCategories,
        yearFrom: yearFrom ? parseInt(yearFrom) : null,
        yearTo: yearTo ? parseInt(yearTo) : null,
        enabledTags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/knowledge-config`] });
      refetchStats();
      setHasChanges(false);
      toast.success("Knowledge sources updated");
    },
    onError: (error: any) => {
      toast.error("Failed to save", { description: error.message });
    },
  });

  const toggleCategory = (cat: string) => {
    setEnabledCategories((prev) => {
      const next = prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat];
      setHasChanges(true);
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setEnabledTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      setHasChanges(true);
      return next;
    });
  };

  const handleYearChange = (field: "from" | "to", value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    if (field === "from") setYearFrom(cleaned);
    else setYearTo(cleaned);
    setHasChanges(true);
  };

  if (configLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#FB4F14]" />
          <CardTitle className="text-lg">Knowledge Sources</CardTitle>
        </div>
        <CardDescription>
          Control which data sources the AI searches for this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Source Categories
          </Label>
          <div className="space-y-2">
            {ALL_CATEGORIES.map((cat) => (
              <div
                key={cat}
                className="flex items-center justify-between py-2 px-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                data-testid={`toggle-category-${cat.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{categoryIcons[cat]}</span>
                  <span className="text-sm font-medium">{cat}</span>
                </div>
                <Switch
                  checked={enabledCategories.includes(cat)}
                  onCheckedChange={() => toggleCategory(cat)}
                  data-testid={`switch-category-${cat.replace(/\s+/g, "-").toLowerCase()}`}
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium">Year Range</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="From (e.g. 2020)"
                value={yearFrom}
                onChange={(e) => handleYearChange("from", e.target.value)}
                className="text-center"
                data-testid="input-year-from"
              />
            </div>
            <span className="text-muted-foreground text-sm">to</span>
            <div className="flex-1">
              <Input
                placeholder="To (e.g. 2025)"
                value={yearTo}
                onChange={(e) => handleYearChange("to", e.target.value)}
                className="text-center"
                data-testid="input-year-to"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to include all years.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-medium">Tag Filters</Label>
          {allTags && allTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={enabledTags.includes(tag) ? "default" : "outline"}
                  className={`cursor-pointer transition-colors ${
                    enabledTags.includes(tag)
                      ? "bg-[#FB4F14] hover:bg-[#FB4F14]/80 text-white"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => toggleTag(tag)}
                  data-testid={`tag-${tag.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {tag}
                  {enabledTags.includes(tag) && <X className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No tags found. Add tags to documents or URLs in the Knowledge Base.
            </p>
          )}
        </div>

        <Separator />

        <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[#002244]/5 border border-[#002244]/10">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#002244]" />
              <span className="text-sm font-semibold text-[#002244]" data-testid="text-doc-count">
                {stats?.documentCount ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">documents</span>
            </div>
            <span className="text-muted-foreground">·</span>
            <div className="flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-[#002244]" />
              <span className="text-sm font-semibold text-[#002244]" data-testid="text-url-count">
                {stats?.urlCount ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">URLs</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          AI will search these sources matching your filters.
        </p>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !hasChanges}
          className="w-full bg-[#FB4F14] hover:bg-[#FB4F14]/90 text-white"
          data-testid="button-save-knowledge-config"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Knowledge Config
        </Button>
      </CardContent>
    </Card>
  );
}
