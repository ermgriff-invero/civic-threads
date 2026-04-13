import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Loader2, ClipboardList, Plus, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

type DestinationType = "granicus" | "legistar" | "email" | "download_pdf";

interface AgendaSettings {
  id: number;
  agendaDestinationType: string;
  granicusApiKey: string | null;
  granicusEndpointUrl: string | null;
  legistarApiKey: string | null;
  legistarEndpointUrl: string | null;
  clerkEmail: string | null;
  agendaCategories: string[] | null;
}

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [destType, setDestType] = useState<DestinationType>("download_pdf");
  const [granicusApiKey, setGranicusApiKey] = useState("");
  const [granicusEndpoint, setGranicusEndpoint] = useState("");
  const [legistarApiKey, setLegistarApiKey] = useState("");
  const [legistarEndpoint, setLegistarEndpoint] = useState("");
  const [clerkEmail, setClerkEmail] = useState("");
  const [categories, setCategories] = useState<string[]>(["New Business", "Old Business", "Public Hearing", "Consent Agenda"]);
  const [newCategory, setNewCategory] = useState("");

  const { data: settings, isLoading } = useQuery<AgendaSettings | null>({
    queryKey: ["/api/settings/agenda"],
  });

  useEffect(() => {
    if (settings) {
      setDestType(settings.agendaDestinationType as DestinationType);
      setGranicusApiKey(settings.granicusApiKey || "");
      setGranicusEndpoint(settings.granicusEndpointUrl || "");
      setLegistarApiKey(settings.legistarApiKey || "");
      setLegistarEndpoint(settings.legistarEndpointUrl || "");
      setClerkEmail(settings.clerkEmail || "");
      if (settings.agendaCategories && settings.agendaCategories.length > 0) {
        setCategories(settings.agendaCategories);
      }
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        agendaDestinationType: destType,
        agendaCategories: categories,
      };
      if (destType === "granicus") {
        body.granicusApiKey = granicusApiKey || null;
        body.granicusEndpointUrl = granicusEndpoint || null;
      }
      if (destType === "legistar") {
        body.legistarApiKey = legistarApiKey || null;
        body.legistarEndpointUrl = legistarEndpoint || null;
      }
      if (destType === "email") {
        body.clerkEmail = clerkEmail || null;
      }
      return apiRequest("PUT", "/api/settings/agenda", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/agenda"] });
      toast.success("Agenda integration settings saved");
    },
    onError: (error: any) => {
      toast.error("Failed to save settings", { description: error.message });
    },
  });

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
      setNewCategory("");
    }
  };

  const removeCategory = (cat: string) => {
    setCategories(categories.filter(c => c !== cat));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/threads">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#002244]" data-testid="text-admin-title">Admin Settings</h1>
          <p className="text-sm text-muted-foreground">Configure your municipality's integrations</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#FB4F14]" />
            <CardTitle className="text-lg">Agenda Integration</CardTitle>
          </div>
          <CardDescription>
            Configure how drafted documents are sent to the Clerk's meeting agenda system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="dest-type">Destination Type</Label>
            <Select value={destType} onValueChange={(v) => setDestType(v as DestinationType)}>
              <SelectTrigger id="dest-type" data-testid="select-destination-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="granicus">Granicus (API)</SelectItem>
                <SelectItem value="legistar">Legistar (API)</SelectItem>
                <SelectItem value="email">Email to Clerk</SelectItem>
                <SelectItem value="download_pdf">Download as PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {destType === "granicus" && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <h4 className="text-sm font-medium">Granicus Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="granicus-key">API Key</Label>
                <Input
                  id="granicus-key"
                  type="password"
                  value={granicusApiKey}
                  onChange={(e) => setGranicusApiKey(e.target.value)}
                  placeholder="Enter Granicus API key"
                  data-testid="input-granicus-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="granicus-url">Endpoint URL</Label>
                <Input
                  id="granicus-url"
                  value={granicusEndpoint}
                  onChange={(e) => setGranicusEndpoint(e.target.value)}
                  placeholder="https://api.granicus.com/v1/"
                  data-testid="input-granicus-endpoint"
                />
              </div>
            </div>
          )}

          {destType === "legistar" && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <h4 className="text-sm font-medium">Legistar Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="legistar-key">API Key</Label>
                <Input
                  id="legistar-key"
                  type="password"
                  value={legistarApiKey}
                  onChange={(e) => setLegistarApiKey(e.target.value)}
                  placeholder="Enter Legistar API key"
                  data-testid="input-legistar-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legistar-url">Endpoint URL</Label>
                <Input
                  id="legistar-url"
                  value={legistarEndpoint}
                  onChange={(e) => setLegistarEndpoint(e.target.value)}
                  placeholder="https://webapi.legistar.com/v1/"
                  data-testid="input-legistar-endpoint"
                />
              </div>
            </div>
          )}

          {destType === "email" && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <h4 className="text-sm font-medium">Email Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="clerk-email">Clerk Email Address</Label>
                <Input
                  id="clerk-email"
                  type="email"
                  value={clerkEmail}
                  onChange={(e) => setClerkEmail(e.target.value)}
                  placeholder="clerk@cityofdenver.gov"
                  data-testid="input-clerk-email"
                />
              </div>
            </div>
          )}

          {destType === "download_pdf" && (
            <div className="p-4 bg-muted/50 rounded-lg border">
              <p className="text-sm text-muted-foreground">
                Documents will be downloaded as PDF files that staff can manually submit to the agenda system.
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <Label>Agenda Item Categories</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Badge
                  key={cat}
                  variant="secondary"
                  className="gap-1 pr-1"
                  data-testid={`badge-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  {cat}
                  <button
                    onClick={() => removeCategory(cat)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    data-testid={`button-remove-category-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Add a category..."
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                data-testid="input-new-category"
              />
              <Button variant="outline" size="sm" onClick={addCategory} data-testid="button-add-category">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full bg-[#FB4F14] hover:bg-[#FB4F14]/90 text-white"
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
