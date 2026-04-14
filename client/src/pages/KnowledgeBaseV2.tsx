import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Unplug,
  Bug,
  ExternalLink,
  Sparkles,
  Layers,
  History,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DriveStatus = {
  configured: boolean;
  connected: boolean;
  tenantKey: string | null;
};

type DrivePeekItem = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
};

type DriveDebugStep = { step: string; ms: number; ok?: boolean; detail?: Record<string, unknown> };

type PeekResponse = {
  tenantKey: string;
  parent: string;
  user: { emailAddress?: string; displayName?: string } | null;
  itemCount: number;
  nextPageToken?: string | null;
  items: DrivePeekItem[];
  debug?: { steps: DriveDebugStep[]; at: string };
};

type PreviewResponse = {
  tenantKey: string;
  fileId: string;
  name: string;
  mimeType: string;
  previewKind: "text" | "empty" | "unsupported";
  text?: string;
  truncated?: boolean;
  note?: string;
  debug?: { steps: DriveDebugStep[]; at: string };
};

type ScopeResponse = {
  tenantKey: string;
  rootName: string;
  rootId: string;
};

type ShadowTreePilotStatsOk = {
  ok: true;
  tenantKey: string;
  scopedRootName: string;
  totalFolders: number;
  totalDocs: number;
  dirtyFolders: number;
  foldersMissingAiSummary: number;
  docsMissingAiSummary: number;
  docsMarkedStale: number;
};

type SyncResponse = {
  ok: boolean;
  tenantKey: string;
  rootName: string;
  rootId: string;
  dryRun: boolean;
  foldersSeen: number;
  filesSeen: number;
  foldersUpserted: number;
  docsUpserted: number;
  pagesFetched: number;
  driveChangesPages?: number;
  /** Local DB map health after a live sync (not dry-run). */
  shadowStats?: ShadowTreePilotStatsOk | { error: string } | null;
  debug?: { steps: DriveDebugStep[]; at: string };
};

function formatShadowStatsLines(s: ShadowTreePilotStatsOk): string[] {
  return [
    `Folders: ${s.totalFolders} in map · ${s.dirtyFolders} dirty · ${s.foldersMissingAiSummary} without folder summary`,
    `Docs: ${s.totalDocs} in map · ${s.docsMissingAiSummary} without doc summary · ${s.docsMarkedStale} stale (Drive changed)`,
  ];
}

function shadowStatsToastDescription(s: ShadowTreePilotStatsOk): string {
  return formatShadowStatsLines(s).join(" · ");
}

type MapRunLogDoc = { docId: number; title: string; action: string; detail?: string };
type MapRunLogFolder = { folderId: number; title: string; action: string; detail?: string };

/** Successful POST …/summaries/run body (subset used in UI). */
type SummariesRunOk = {
  ok: true;
  dirtyOnly: boolean;
  finishedAt: string;
  mapSnapshot: { totalDocs: number; totalFolders: number };
  docsConsidered: number;
  docsSummarized: number;
  docsFirstSummarized: number;
  docsRegenerated: number;
  foldersSummarized: number;
  foldersFirstSummarized: number;
  foldersRegenerated: number;
  foldersDirtyClearedNoRollup: number;
  docFailures: unknown[];
  folderFailures: unknown[];
  docRunLog: MapRunLogDoc[];
  folderRunLog: MapRunLogFolder[];
};

type LastMapSummaryRunDisplay = {
  mode: "full" | "stale";
  finishedAt: string;
  mapSnapshot: { totalDocs: number; totalFolders: number };
  docsConsidered: number;
  docsSummarized: number;
  docsFirstSummarized: number;
  docsRegenerated: number;
  foldersSummarized: number;
  foldersFirstSummarized: number;
  foldersRegenerated: number;
  foldersDirtyClearedNoRollup: number;
  docFailureCount: number;
  folderFailureCount: number;
  docRunLog: MapRunLogDoc[];
  folderRunLog: MapRunLogFolder[];
};

function summariesRunToDisplay(d: SummariesRunOk, mode: "full" | "stale"): LastMapSummaryRunDisplay {
  return {
    mode,
    finishedAt: d.finishedAt,
    mapSnapshot: d.mapSnapshot,
    docsConsidered: d.docsConsidered,
    docsSummarized: d.docsSummarized,
    docsFirstSummarized: d.docsFirstSummarized,
    docsRegenerated: d.docsRegenerated,
    foldersSummarized: d.foldersSummarized,
    foldersFirstSummarized: d.foldersFirstSummarized,
    foldersRegenerated: d.foldersRegenerated,
    foldersDirtyClearedNoRollup: d.foldersDirtyClearedNoRollup,
    docFailureCount: Array.isArray(d.docFailures) ? d.docFailures.length : 0,
    folderFailureCount: Array.isArray(d.folderFailures) ? d.folderFailures.length : 0,
    docRunLog: d.docRunLog,
    folderRunLog: d.folderRunLog,
  };
}

function parseDocRunLog(raw: unknown): MapRunLogDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: MapRunLogDoc[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.docId !== "number" || typeof o.title !== "string" || typeof o.action !== "string") continue;
    out.push({
      docId: o.docId,
      title: o.title,
      action: o.action,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    });
  }
  return out;
}

function parseFolderRunLog(raw: unknown): MapRunLogFolder[] {
  if (!Array.isArray(raw)) return [];
  const out: MapRunLogFolder[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.folderId !== "number" || typeof o.title !== "string" || typeof o.action !== "string") continue;
    out.push({
      folderId: o.folderId,
      title: o.title,
      action: o.action,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    });
  }
  return out;
}

function formatDocRunAction(action: string): string {
  switch (action) {
    case "summarized_first":
      return "Summarized (first time)";
    case "summarized_regen":
      return "Summarized (regenerated)";
    case "failed":
      return "Failed";
    default:
      return action;
  }
}

function formatFolderRunAction(action: string): string {
  switch (action) {
    case "rollup_first":
      return "OpenAI folder rollup (first summary)";
    case "rollup_regen":
      return "OpenAI folder rollup (regenerated)";
    case "dirty_cleared_no_rollup":
      return "Dirty cleared — no doc/child text to aggregate";
    case "skipped_not_dirty":
      return "Skipped — not dirty (off the change chain, e.g. sibling folder)";
    case "noop_nothing_to_roll_up":
      return "No work — nothing to aggregate, folder already clean";
    case "rollup_failed":
      return "OpenAI rollup failed";
    default:
      return action;
  }
}

function appendSyncStatsToDescription(
  base: string,
  shadowStats: SyncResponse["shadowStats"],
): string {
  if (!shadowStats) return base;
  if ("error" in shadowStats) {
    return `${base} (Map stats: ${shadowStats.error})`;
  }
  if ("totalFolders" in shadowStats) {
    return `${base} ${shadowStatsToastDescription(shadowStats as ShadowTreePilotStatsOk)}`;
  }
  return base;
}

type LogEntry = {
  id: string;
  at: string;
  label: string;
  ok: boolean;
  payload: unknown;
};

async function driveFetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, { credentials: "include" });
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { raw: text } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

async function drivePostJson<T>(
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { _nonJson: text.slice(0, 2000) } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

function logButtonResult(label: string, ok: boolean, payload: unknown) {
  const style = ok ? "color:#166534;font-weight:bold;" : "color:#b91c1c;font-weight:bold;";
  console.groupCollapsed(`%c[KB2 button] ${label} -> ${ok ? "SUCCESS" : "FAILED"}`, style);
  console.log(payload);
  console.groupEnd();
}

type ShadowTreeNode = {
  id: number;
  title: string;
  externalId: string;
  aiSummary: string | null;
  isDirty: boolean;
  documents: Array<{ id: number; title: string; type: string; summary: string | null }>;
  children: ShadowTreeNode[];
};

type ShadowTreeApiResponse = {
  tenantKey: string;
  root: ShadowTreeNode;
  stats: { folderCount: number; documentCount: number };
};

function ShadowTreeNodeView({ node, depth }: { node: ShadowTreeNode; depth: number }) {
  return (
    <div className={cn("space-y-2", depth > 0 && "ml-2 pl-3 border-l border-border/80")}>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Folder className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="break-words">{node.title}</span>
          <Badge variant="outline" className="text-[10px] font-mono">
            #{node.id}
          </Badge>
          {node.isDirty ? (
            <Badge variant="secondary" className="text-[10px]">
              dirty
            </Badge>
          ) : null}
        </div>
        {node.aiSummary ? (
          <p className="text-xs text-muted-foreground mt-1 pl-6 leading-snug">{node.aiSummary}</p>
        ) : (
          <p className="text-xs text-muted-foreground/70 italic mt-1 pl-6">No folder summary yet.</p>
        )}
      </div>
      {node.documents.length > 0 ? (
        <ul className="pl-6 space-y-2">
          {node.documents.map((d) => (
            <li key={d.id} className="text-xs">
              <div className="flex gap-1.5 items-start">
                <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <div>
                    <span className="font-medium">{d.title}</span>{" "}
                    <span className="text-muted-foreground font-normal">· doc {d.id}</span>
                  </div>
                  {d.summary ? (
                    <p className="text-muted-foreground mt-0.5 leading-snug">{d.summary}</p>
                  ) : (
                    <p className="italic text-muted-foreground/80 mt-0.5">No AI summary yet.</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {node.children.map((c) => (
        <ShadowTreeNodeView key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function isHtmlFallbackPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const raw =
    ("raw" in payload && typeof (payload as { raw?: unknown }).raw === "string"
      ? (payload as { raw: string }).raw
      : undefined) ??
    ("_nonJson" in payload && typeof (payload as { _nonJson?: unknown })._nonJson === "string"
      ? (payload as { _nonJson: string })._nonJson
      : undefined);
  if (!raw) return false;
  const head = raw.slice(0, 200).toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html");
}

/** When /api returns ERR_CONNECTION_REFUSED — print this in the console. */
function logApiUnreachableHelp(context: string) {
  if (typeof window === "undefined") {
    return;
  }
  const { origin, port, host } = window.location;
  const portHint = port || "(empty — check terminal for actual port)";

  console.error(
    `%c[${context}] API unreachable (net::ERR_CONNECTION_REFUSED)`,
    "color:#b91c1c;font-weight:bold;font-size:12px;",
  );
  console.error(
    [
      "Nothing is accepting HTTP on this origin — the Express API is not running where this tab is pointed.",
      "",
      "Fix — ONE process that serves both UI and /api:",
      "  npm run dev",
      "  or:  python3 dev_start.py",
      "",
      "Avoid for Drive / KB 2.0:",
      "  npm run dev:client  → Vite only, no /api.",
      "",
      `This tab: ${origin} (host ${host}, port ${portHint})`,
      "Terminal should log:  serving on port <same number as your URL>.",
      "",
      "Google OAuth redirect URI must match, e.g.",
      `${origin}/api/integrations/google-drive/callback`,
      "Set GOOGLE_OAUTH_REDIRECT_URI in .env if Google Cloud still lists another port.",
    ].join("\n"),
  );
}

export default function KnowledgeBaseV2() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verboseDebug, setVerboseDebug] = useState(false);
  const [connectionAdvancedOpen, setConnectionAdvancedOpen] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([
    { id: "root", name: "My Drive" },
  ]);
  const [selectedFile, setSelectedFile] = useState<DrivePeekItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [debugRunning, setDebugRunning] = useState(false);
  const [syncRunning, setSyncRunning] = useState<"dry" | "live" | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [summaryRunning, setSummaryRunning] = useState(false);
  const [fullMapSummaryRunning, setFullMapSummaryRunning] = useState(false);
  const [staleOnlySummaryRunning, setStaleOnlySummaryRunning] = useState(false);
  const [agentQuestion, setAgentQuestion] = useState(
    "What documents are in the pilot folder, and what is one key theme from TD Design Patterns?",
  );
  const [agentRunning, setAgentRunning] = useState(false);
  const [includeTreeInAgent, setIncludeTreeInAgent] = useState(true);
  const [shadowTreeRefreshing, setShadowTreeRefreshing] = useState(false);
  const [agentResult, setAgentResult] = useState<{
    answer: string;
    rounds?: number;
    toolCallsExecuted?: number;
    rootFolderId?: number;
  } | null>(null);
  const [lastMapSummaryRun, setLastMapSummaryRun] = useState<LastMapSummaryRunDisplay | null>(null);

  const parentId = breadcrumb[breadcrumb.length - 1]?.id ?? "root";

  const appendLog = useCallback((label: string, ok: boolean, payload: unknown) => {
    setLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        at: new Date().toISOString(),
        label,
        ok,
        payload,
      },
      ...prev,
    ].slice(0, 40));
  }, []);

  const {
    data: status,
    isError: statusQueryFailed,
    error: statusQueryError,
    refetch: refetchStatus,
  } = useQuery<DriveStatus>({
    queryKey: ["/api/integrations/google-drive/status"],
    enabled: !authLoading && Boolean(user),
  });

  const {
    data: scopeData,
    refetch: refetchScope,
    isFetching: scopeLoading,
  } = useQuery({
    queryKey: ["/api/integrations/google-drive/scope"],
    queryFn: async () => {
      const r = await driveFetchJson<ScopeResponse>("/api/integrations/google-drive/scope");
      appendLog("scope", r.ok, r.data);
      if (!r.ok) {
        const msg =
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return r.data;
    },
    enabled: !authLoading && Boolean(user) && Boolean(status?.connected),
    retry: false,
  });

  const {
    data: shadowTree,
    isLoading: shadowTreeLoading,
    error: shadowTreeError,
    refetch: refetchShadowTree,
  } = useQuery({
    queryKey: ["/api/integrations/google-drive/shadow-tree/tree"],
    queryFn: async () => {
      const r = await driveFetchJson<ShadowTreeApiResponse>("/api/integrations/google-drive/shadow-tree/tree");
      appendLog("shadow-tree", r.ok, r.data);
      if (!r.ok) {
        const msg =
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return r.data;
    },
    enabled: !authLoading && Boolean(user) && Boolean(status?.connected),
    retry: false,
  });

  const {
    data: shadowPilotStats,
    isLoading: shadowStatsLoading,
    error: shadowStatsError,
  } = useQuery({
    queryKey: ["/api/integrations/google-drive/shadow-tree/stats"],
    queryFn: async () => {
      const r = await driveFetchJson<ShadowTreePilotStatsOk>(
        "/api/integrations/google-drive/shadow-tree/stats",
      );
      if (!r.ok) {
        const msg =
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return r.data;
    },
    enabled: !authLoading && Boolean(user) && Boolean(status?.connected),
    retry: false,
  });

  const peekUrl = useMemo(() => {
    const q = new URLSearchParams({ parent: parentId, limit: "100" });
    if (verboseDebug) {
      q.set("debug", "1");
    }
    return `/api/integrations/google-drive/peek?${q.toString()}`;
  }, [parentId, verboseDebug]);

  const {
    data: peek,
    isLoading: peekLoading,
    error: peekError,
    refetch: refetchPeek,
  } = useQuery({
    queryKey: ["/api/integrations/google-drive/peek", parentId, verboseDebug],
    queryFn: async () => {
      const r = await driveFetchJson<PeekResponse>(peekUrl);
      appendLog(`peek parent=${parentId}`, r.ok, r.data);
      if (!r.ok) {
        const msg =
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return r.data;
    },
    enabled: !authLoading && Boolean(user) && Boolean(status?.connected),
    retry: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive") !== "connected") {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/status"] });
    toast({ title: "Google Drive linked", description: "You can browse folders below." });
    window.history.replaceState({}, "", "/knowledge-base-2");
  }, [queryClient, toast]);

  useEffect(() => {
    if (!scopeData?.rootId) return;
    setBreadcrumb([{ id: scopeData.rootId, name: scopeData.rootName }]);
  }, [scopeData?.rootId, scopeData?.rootName]);

  const openFolder = (item: DrivePeekItem) => {
    if (!item.isFolder) {
      return;
    }
    setBreadcrumb((b) => [...b, { id: item.id, name: item.name }]);
    setSelectedFile(null);
    setPreviewResult(null);
  };

  const crumbTo = (index: number) => {
    setBreadcrumb((b) => b.slice(0, index + 1));
    setSelectedFile(null);
    setPreviewResult(null);
  };

  const loadPreview = async (file: DrivePeekItem) => {
    if (file.isFolder) {
      openFolder(file);
      return;
    }
    setSelectedFile(file);
    setPreviewLoading(true);
    setPreviewResult(null);
    const q = verboseDebug ? "?debug=1" : "";
    const url = `/api/integrations/google-drive/files/${encodeURIComponent(file.id)}/preview${q}`;
    const r = await driveFetchJson<PreviewResponse>(url);
    appendLog(`preview ${file.name}`, r.ok, r.data);
    setPreviewLoading(false);
    if (!r.ok) {
      toast({
        title: "Preview failed",
        description:
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`,
        variant: "destructive",
      });
      return;
    }
    setPreviewResult(r.data);
  };

  const connectDrive = () => {
    logButtonResult("Connect Google Drive (redirect)", true, {
      to: "/api/integrations/google-drive/start",
      at: new Date().toISOString(),
    });
    window.location.href = "/api/integrations/google-drive/start";
  };

  const debugGoogleDrive = async () => {
    setDebugRunning(true);
    const banner = "%c[Civic Threads · Google Drive debug]";
    const style = "color:#0f766e;font-weight:bold;";
    let unreachableHelpShown = false;
    try {
      console.groupCollapsed(banner, style);
      console.log("Time:", new Date().toISOString());
      console.log("Page:", window.location.href);

      const probe = async (label: string, url: string) => {
        const t0 = performance.now();
        try {
          const res = await fetch(url, { credentials: "include" });
          const text = await res.text();
          let body: unknown = text;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = { _nonJson: text.slice(0, 800) };
          }
          console.log(label, {
            status: res.status,
            ok: res.ok,
            ms: Math.round(performance.now() - t0),
            body,
          });
          return { ok: res.ok, body };
        } catch (e) {
          console.error(label, "FETCH_FAILED — server unreachable or blocked?", e);
          if (!unreachableHelpShown) {
            logApiUnreachableHelp(label);
            unreachableHelpShown = true;
          }
          return { ok: false, body: null };
        }
      };

      await probe("① diagnostics", "/api/integrations/google-drive/diagnostics");
      const st = await probe("② status", "/api/integrations/google-drive/status");

      const connected =
        typeof st.body === "object" &&
        st.body !== null &&
        "connected" in st.body &&
        (st.body as { connected?: boolean }).connected === true;

      if (connected) {
        const q = new URLSearchParams({ parent: "root", limit: "10", debug: "1" });
        await probe("③ peek smoke (root)", `/api/integrations/google-drive/peek?${q}`);
      } else {
        console.log("③ peek skipped — connect Drive first.");
      }

      console.log(
        "Tip: background.js / FrameDoesNotExist = browser extension noise. ERR_CONNECTION_REFUSED = dev server stopped or wrong port.",
      );
      console.groupEnd();
      toast({
        title: "Google Drive debug",
        description: "Open DevTools → Console (F12) for the full report.",
      });
    } finally {
      setDebugRunning(false);
    }
  };

  const disconnectDrive = async () => {
    try {
      const r = await drivePostJson<{ ok?: boolean; tenantKey?: string; message?: string }>(
        "/api/integrations/google-drive/disconnect",
      );
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog("disconnect", logicalOk, r.data);
      logButtonResult("Disconnect", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Server likely returned app fallback page."
            : 
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/status"] });
      queryClient.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "/api/integrations/google-drive/peek",
      });
      queryClient.removeQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/tree"] });
      queryClient.removeQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/stats"] });
      setBreadcrumb([{ id: "root", name: "My Drive" }]);
      setSelectedFile(null);
      setPreviewResult(null);
      setLastMapSummaryRun(null);
      toast({ title: "Disconnected", description: "Google Drive unlinked for this tenant." });
    } catch (e) {
      appendLog("disconnect", false, { error: String(e) });
      toast({ title: "Disconnect failed", description: String(e), variant: "destructive" });
    }
  };

  const runSync = async (dryRun: boolean) => {
    setSyncRunning(dryRun ? "dry" : "live");
    try {
      const query = new URLSearchParams();
      if (verboseDebug) query.set("debug", "1");
      if (dryRun) query.set("dryRun", "true");
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const r = await drivePostJson<SyncResponse>(`/api/integrations/google-drive/sync${suffix}`);
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog(dryRun ? "sync-dry-run" : "sync-run", logicalOk, r.data);
      logButtonResult(dryRun ? "Dry Run Sync" : "Run Sync", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            :
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`,
        );
      }
      const body = r.data as SyncResponse;
      toast({
        title: dryRun ? "Dry run complete" : "Sync complete",
        description: dryRun
          ? `${body.foldersSeen} folders, ${body.filesSeen} files scanned (dry run — DB unchanged)`
          : appendSyncStatsToDescription(
              `${body.foldersSeen} folders, ${body.filesSeen} files scanned from Drive.`,
              body.shadowStats,
            ),
      });
      if (!dryRun) {
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/tree"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/stats"] });
        await Promise.all([refetchPeek(), refetchScope()]);
      }
    } catch (error) {
      appendLog(dryRun ? "sync-dry-run" : "sync-run", false, { error: String(error) });
      toast({
        title: dryRun ? "Dry run failed" : "Sync failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setSyncRunning(null);
    }
  };

  /** Sync Drive metadata into the shadow tree DB, then reload the tree view. */
  const refreshShadowTree = async () => {
    setShadowTreeRefreshing(true);
    try {
      const query = new URLSearchParams();
      if (verboseDebug) query.set("debug", "1");
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const r = await drivePostJson<SyncResponse>(`/api/integrations/google-drive/sync${suffix}`);
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog("shadow-tree-refresh-sync", logicalOk, r.data);
      logButtonResult("Refresh shadow tree", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            : typeof r.data === "object" && r.data && "message" in r.data
              ? String((r.data as { message: string }).message)
              : `HTTP ${r.status}`,
        );
      }
      const body = r.data as SyncResponse;
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/tree"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/stats"] });
      await Promise.all([refetchPeek(), refetchScope()]);
      toast({
        title: "Sync from Drive complete",
        description: appendSyncStatsToDescription(
          `${body.foldersSeen} folders, ${body.filesSeen} files scanned from Drive.`,
          body.shadowStats,
        ),
      });
    } catch (error) {
      appendLog("shadow-tree-refresh-sync", false, { error: String(error) });
      toast({ title: "Refresh shadow tree failed", description: String(error), variant: "destructive" });
    } finally {
      setShadowTreeRefreshing(false);
    }
  };

  const runVerify = async () => {
    setVerifyRunning(true);
    try {
      const q = verboseDebug ? "?debug=1" : "";
      const r = await driveFetchJson<Record<string, unknown>>(`/api/integrations/google-drive/verify${q}`);
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog("verify", logicalOk, r.data);
      logButtonResult("Verify Linkage", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            :
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`,
        );
      }
      toast({ title: "Verification complete", description: "Review the debug log for linkage/scope checks." });
    } catch (error) {
      toast({ title: "Verification failed", description: String(error), variant: "destructive" });
    } finally {
      setVerifyRunning(false);
    }
  };

  const runSampleSummary = async () => {
    setSummaryRunning(true);
    try {
      const q = verboseDebug ? "?debug=1" : "";
      const r = await drivePostJson<Record<string, unknown>>(
        `/api/integrations/google-drive/summaries/sample${q}`,
        {
        maxCompletionTokens: 400,
        },
      );
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog("summary-sample", logicalOk, r.data);
      logButtonResult("Sample Summary", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            :
          typeof r.data === "object" && r.data && "message" in r.data
            ? String((r.data as { message: string }).message)
            : `HTTP ${r.status}`,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/tree"] });
      toast({ title: "Sample summary generated", description: "Saved to the selected document description." });
    } catch (error) {
      appendLog("summary-sample", false, { error: String(error) });
      toast({ title: "Sample summary failed", description: String(error), variant: "destructive" });
    } finally {
      setSummaryRunning(false);
    }
  };

  /** Day 3: bottom-up map — summarize docs + folder rollups. `dirtyOnly` skips already-clean rows when possible. */
  const runMapSummaries = async (dirtyOnly: boolean) => {
    const setRunning = dirtyOnly ? setStaleOnlySummaryRunning : setFullMapSummaryRunning;
    const label = dirtyOnly ? "Stale summaries only" : "Run Full Map Summaries";
    setRunning(true);
    try {
      const q = verboseDebug ? "?debug=1" : "";
      const r = await drivePostJson<Record<string, unknown>>(`/api/integrations/google-drive/summaries/run${q}`, {
        maxCompletionTokens: 400,
        dirtyOnly,
      });
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog(dirtyOnly ? "summary-run-stale" : "summary-run-map", logicalOk, r.data);
      logButtonResult(label, logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            : typeof r.data === "object" && r.data && "message" in r.data
              ? String((r.data as { message: string }).message)
              : `HTTP ${r.status}`,
        );
      }
      const raw = r.data as Record<string, unknown>;
      const mapSnap = raw.mapSnapshot as { totalDocs?: number; totalFolders?: number } | undefined;
      const summaryPayload: SummariesRunOk = {
        ok: true,
        dirtyOnly: Boolean(raw.dirtyOnly),
        finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : new Date().toISOString(),
        mapSnapshot: {
          totalDocs: typeof mapSnap?.totalDocs === "number" ? mapSnap.totalDocs : 0,
          totalFolders: typeof mapSnap?.totalFolders === "number" ? mapSnap.totalFolders : 0,
        },
        docsConsidered: typeof raw.docsConsidered === "number" ? raw.docsConsidered : 0,
        docsSummarized: typeof raw.docsSummarized === "number" ? raw.docsSummarized : 0,
        docsFirstSummarized: typeof raw.docsFirstSummarized === "number" ? raw.docsFirstSummarized : 0,
        docsRegenerated: typeof raw.docsRegenerated === "number" ? raw.docsRegenerated : 0,
        foldersSummarized: typeof raw.foldersSummarized === "number" ? raw.foldersSummarized : 0,
        foldersFirstSummarized: typeof raw.foldersFirstSummarized === "number" ? raw.foldersFirstSummarized : 0,
        foldersRegenerated: typeof raw.foldersRegenerated === "number" ? raw.foldersRegenerated : 0,
        foldersDirtyClearedNoRollup:
          typeof raw.foldersDirtyClearedNoRollup === "number" ? raw.foldersDirtyClearedNoRollup : 0,
        docFailures: Array.isArray(raw.docFailures) ? raw.docFailures : [],
        folderFailures: Array.isArray(raw.folderFailures) ? raw.folderFailures : [],
        docRunLog: parseDocRunLog(raw.docRunLog),
        folderRunLog: parseFolderRunLog(raw.folderRunLog),
      };
      setLastMapSummaryRun(summariesRunToDisplay(summaryPayload, dirtyOnly ? "stale" : "full"));
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/tree"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/integrations/google-drive/shadow-tree/stats"] });
      toast({
        title: dirtyOnly ? "Stale summaries updated" : "Map summaries updated",
        description: `${summaryPayload.docsSummarized} docs (${summaryPayload.docsFirstSummarized} new, ${summaryPayload.docsRegenerated} regen) · ${summaryPayload.foldersSummarized} folder rollups · ${summaryPayload.mapSnapshot.totalDocs} docs in map.`,
      });
    } catch (error) {
      appendLog(dirtyOnly ? "summary-run-stale" : "summary-run-map", false, { error: String(error) });
      toast({
        title: dirtyOnly ? "Stale-only summaries failed" : "Full map summaries failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const runFullMapSummaries = async () => runMapSummaries(false);
  const runStaleOnlySummaries = async () => runMapSummaries(true);

  /** Day 4: OpenAI tool loop — list_folder + read_document. */
  const runShadowTreeAgent = async () => {
    const q = agentQuestion.trim();
    if (!q) {
      toast({ title: "Enter a question", variant: "destructive" });
      return;
    }
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const r = await drivePostJson<Record<string, unknown>>("/api/integrations/google-drive/shadow-tree/query", {
        question: q,
        includeTreeContext: includeTreeInAgent,
      });
      const logicalOk = r.ok && !isHtmlFallbackPayload(r.data);
      appendLog("shadow-tree-query", logicalOk, r.data);
      logButtonResult("Shadow Tree Agent", logicalOk, r.data);
      if (!logicalOk) {
        throw new Error(
          isHtmlFallbackPayload(r.data)
            ? "Received HTML instead of API JSON. Route not matched or backend not restarted."
            : typeof r.data === "object" && r.data && "message" in r.data
              ? String((r.data as { message: string }).message)
              : `HTTP ${r.status}`,
        );
      }
      const d = r.data as {
        answer?: string;
        rounds?: number;
        toolCallsExecuted?: number;
        rootFolderId?: number;
      };
      setAgentResult({
        answer: d.answer ?? "",
        rounds: d.rounds,
        toolCallsExecuted: d.toolCallsExecuted,
        rootFolderId: d.rootFolderId,
      });
      toast({ title: "Agent answered", description: `Tools used: ${d.toolCallsExecuted ?? "—"}` });
    } catch (error) {
      appendLog("shadow-tree-query", false, { error: String(error) });
      toast({ title: "Shadow Tree Agent failed", description: String(error), variant: "destructive" });
    } finally {
      setAgentRunning(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-10 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Cloud className="w-4 h-4" />
            <span>Shadow tree pilot</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base 2.0</h1>
          <p className="text-muted-foreground mt-1">
            Browse and preview files from the linked Google Drive (read-only). Classic KB is unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/knowledge-base">
            <Button variant="outline" size="sm">
              Classic Knowledge Base
            </Button>
          </Link>
        </div>
      </div>

      {statusQueryFailed ? (
        <Alert variant="destructive">
          <AlertTitle>Backend not reachable on this port</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>
              The app cannot load <code className="text-xs">/api/integrations/google-drive/status</code>{" "}
              (network error: {statusQueryError instanceof Error ? statusQueryError.message : String(statusQueryError)}).
            </p>
            <p>
              Run <code className="text-xs bg-background px-1 rounded">npm run dev</code> or{" "}
              <code className="text-xs bg-background px-1 rounded">python3 dev_start.py</code> — not{" "}
              <code className="text-xs bg-background px-1 rounded">npm run dev:client</code> alone. The terminal
              should log <strong>serving on port</strong> matching this tab (
              <code className="text-xs">{window.location.host}</code>
              {window.location.port ? ` — use port ${window.location.port}` : ""}).
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void refetchStatus()}>
              Retry status
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Connection</CardTitle>
          <CardDescription className="space-y-1">
            <span>
              Tenant{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {status?.tenantKey ?? (statusQueryFailed ? "—" : "…")}
              </code>
            </span>
            {scopeData?.rootId ? (
              <span className="block text-muted-foreground">
                Pilot folder: <span className="text-foreground font-medium">{scopeData.rootName}</span>
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded ml-1.5 hidden sm:inline">
                  {scopeData.rootId}
                </code>
              </span>
            ) : null}
            {status?.configured === false && (
              <span className="block mt-2 text-amber-700 dark:text-amber-400">
                Server missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" className="gap-1">
                  <Cloud className="w-3 h-3" /> Linked
                </Badge>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void refreshShadowTree()}
                  disabled={shadowTreeRefreshing || syncRunning !== null}
                >
                  {shadowTreeRefreshing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Sync from Drive
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void runFullMapSummaries()}
                  disabled={
                    fullMapSummaryRunning || staleOnlySummaryRunning || summaryRunning
                  }
                >
                  {fullMapSummaryRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Full map summaries
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runStaleOnlySummaries()}
                  disabled={
                    fullMapSummaryRunning || staleOnlySummaryRunning || summaryRunning
                  }
                  title="Only docs with docSummaryStale and dirty folders. Use Full map for docs never summarized yet."
                >
                  {staleOnlySummaryRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Stale only
                </Button>
                <Button variant="outline" size="sm" onClick={disconnectDrive}>
                  <Unplug className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2.5 text-xs space-y-1.5">
                <div className="font-medium text-foreground">Local map vs Drive (pilot subtree)</div>
                {shadowStatsLoading ? (
                  <p className="text-muted-foreground">Loading map stats…</p>
                ) : shadowStatsError ? (
                  <p className="text-destructive">
                    {shadowStatsError instanceof Error ? shadowStatsError.message : String(shadowStatsError)}
                  </p>
                ) : shadowPilotStats ? (
                  formatShadowStatsLines(shadowPilotStats).map((line, i) => (
                    <p key={i} className="text-muted-foreground leading-snug">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">Connect and sync to see stats.</p>
                )}
              </div>
              {lastMapSummaryRun ? (
                <div className="rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-xs space-y-1.5">
                  <div className="font-medium text-foreground flex items-center gap-2">
                    <History className="w-4 h-4 text-sky-600 shrink-0" />
                    Last map summary run
                  </div>
                  <p className="text-muted-foreground leading-snug">
                    <span className="text-foreground font-medium">
                      {lastMapSummaryRun.mode === "stale" ? "Stale only" : "Full map"}
                    </span>
                    {" · "}
                    {new Date(lastMapSummaryRun.finishedAt).toLocaleString()}
                  </p>
                  <p className="text-muted-foreground leading-snug">
                    Pilot map:{" "}
                    <span className="text-foreground">{lastMapSummaryRun.mapSnapshot.totalDocs}</span> Drive docs,{" "}
                    <span className="text-foreground">{lastMapSummaryRun.mapSnapshot.totalFolders}</span> folders.
                  </p>
                  <p className="text-muted-foreground leading-snug">
                    This run:{" "}
                    <span className="text-foreground">{lastMapSummaryRun.docsConsidered}</span> doc candidates →{" "}
                    <span className="text-foreground">{lastMapSummaryRun.docsSummarized}</span> summarized (
                    <span className="text-foreground">{lastMapSummaryRun.docsFirstSummarized}</span> first-time,{" "}
                    <span className="text-foreground">{lastMapSummaryRun.docsRegenerated}</span> regenerated).
                  </p>
                  <p className="text-muted-foreground leading-snug">
                    Folders:{" "}
                    <span className="text-foreground">{lastMapSummaryRun.foldersSummarized}</span> OpenAI rollups (
                    <span className="text-foreground">{lastMapSummaryRun.foldersFirstSummarized}</span> new,{" "}
                    <span className="text-foreground">{lastMapSummaryRun.foldersRegenerated}</span> regen),{" "}
                    <span className="text-foreground">{lastMapSummaryRun.foldersDirtyClearedNoRollup}</span> dirty
                    cleared without new rollup text.
                  </p>
                  {lastMapSummaryRun.docFailureCount + lastMapSummaryRun.folderFailureCount > 0 ? (
                    <p className="text-amber-700 dark:text-amber-400 leading-snug">
                      Failures: {lastMapSummaryRun.docFailureCount} doc(s), {lastMapSummaryRun.folderFailureCount}{" "}
                      folder(s) — see debug log.
                    </p>
                  ) : null}
                  {lastMapSummaryRun.mode === "stale" ? (
                    <p className="text-muted-foreground leading-snug border-t border-sky-500/20 pt-2 mt-2">
                      Stale only re-rollups the <span className="text-foreground">folder that holds the changed doc</span>{" "}
                      and <span className="text-foreground">ancestors up to the pilot root</span>. Sibling folders (same
                      depth under root) stay clean and show as &quot;Skipped — not dirty&quot; in the trace below.
                    </p>
                  ) : null}
                  {lastMapSummaryRun.docRunLog.length > 0 ? (
                    <details className="border-t border-sky-500/20 pt-2 mt-2 group">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium list-none flex items-center gap-1">
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-90" />
                        Doc trace ({lastMapSummaryRun.docRunLog.length})
                      </summary>
                      <ul className="mt-2 space-y-1 pl-5 border-l border-border/80 text-muted-foreground">
                        {lastMapSummaryRun.docRunLog.map((e) => (
                          <li key={`${e.docId}-${e.action}`}>
                            <span className="text-foreground font-mono text-[10px]">#{e.docId}</span> {e.title}
                            <span className="text-foreground"> — {formatDocRunAction(e.action)}</span>
                            {e.detail ? (
                              <span className="block text-amber-700 dark:text-amber-400/90 pl-0 mt-0.5">{e.detail}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {lastMapSummaryRun.folderRunLog.length > 0 ? (
                    <details className="border-t border-sky-500/20 pt-2 mt-2 group">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium list-none flex items-center gap-1">
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-90" />
                        Folder trace, bottom-up ({lastMapSummaryRun.folderRunLog.length})
                      </summary>
                      <ul className="mt-2 space-y-1 pl-5 border-l border-border/80 text-muted-foreground">
                        {lastMapSummaryRun.folderRunLog.map((e) => (
                          <li key={`${e.folderId}-${e.title}-${e.action}`}>
                            <span className="text-foreground font-mono text-[10px]">#{e.folderId}</span> {e.title}
                            <span className="text-foreground"> — {formatFolderRunAction(e.action)}</span>
                            {e.detail ? (
                              <span className="block text-amber-700 dark:text-amber-400/90 pl-0 mt-0.5">{e.detail}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  After you run Full map or Stale only, a summary of that pass appears here.
                </p>
              )}
              <Collapsible open={connectionAdvancedOpen} onOpenChange={setConnectionAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 mr-1 transition-transform",
                        connectionAdvancedOpen && "rotate-180",
                      )}
                    />
                    Advanced &amp; debug
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/80 pt-3">
                    <Button variant="outline" size="sm" onClick={() => refetchPeek()} disabled={peekLoading}>
                      <RefreshCw className={cn("w-4 h-4 mr-2", peekLoading && "animate-spin")} />
                      Refresh Drive list
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const result = await refetchScope();
                        const ok = result.status === "success";
                        const logicalOk = ok && !isHtmlFallbackPayload(result.data);
                        const payload = ok
                          ? result.data
                          : { error: result.error ? String(result.error) : "Unknown scope error" };
                        appendLog("resolve-scope", logicalOk, payload);
                        logButtonResult("Resolve Scope", logicalOk, payload);
                        if (logicalOk) {
                          toast({
                            title: "Scope resolved",
                            description: `${result.data?.rootName} (${result.data?.rootId})`,
                          });
                        } else {
                          toast({
                            title: "Scope resolve failed",
                            description: result.error ? String(result.error) : "Unknown error",
                            variant: "destructive",
                          });
                        }
                      }}
                      disabled={scopeLoading}
                    >
                      <RefreshCw className={cn("w-4 h-4 mr-2", scopeLoading && "animate-spin")} />
                      Resolve scope
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void runSync(true)}
                      disabled={syncRunning !== null}
                    >
                      {syncRunning === "dry" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Dry-run sync
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void runVerify()} disabled={verifyRunning}>
                      {verifyRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Verify linkage
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void runSampleSummary()} disabled={summaryRunning}>
                      {summaryRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Sample summary
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void debugGoogleDrive()}
                      disabled={debugRunning}
                    >
                      {debugRunning ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Bug className="w-4 h-4 mr-2" />
                      )}
                      Debug Google Drive
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="verbose-drive" className="text-sm cursor-pointer">
                      Verbose API debug
                    </Label>
                    <Switch id="verbose-drive" checked={verboseDebug} onCheckedChange={setVerboseDebug} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Not linked</Badge>
              <Button size="sm" onClick={connectDrive} disabled={!status?.configured}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Connect Google Drive
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Seeing strange console errors?</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>
            Messages from <code className="text-xs bg-muted px-1 rounded">background.js</code> (Cancelled,
            FrameDoesNotExist, etc.) almost always come from a <strong>browser extension</strong>, not Civic
            Threads. Try a private window with extensions disabled to confirm.
          </p>
          <p>
            <code className="text-xs bg-muted px-1 rounded">net::ERR_CONNECTION_REFUSED</code> on{" "}
            <code className="text-xs bg-muted px-1 rounded">/api/...</code> means the dev server is not
            running or Vite reloaded—restart <code className="text-xs">python3 dev_start.py</code> or{" "}
            <code className="text-xs">npm run dev</code> and keep the tab on the same port.
          </p>
        </AlertDescription>
      </Alert>

      {peekError && status?.connected ? (
        <Alert variant="destructive">
          <AlertTitle>Could not list folder</AlertTitle>
          <AlertDescription>{(peekError as Error).message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="min-h-[320px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Drive browser</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1 text-xs">
              {breadcrumb.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="w-3 h-3 shrink-0" /> : null}
                  <button
                    type="button"
                    className={cn(
                      "hover:underline text-left",
                      i === breadcrumb.length - 1 ? "font-medium text-foreground" : "text-primary",
                    )}
                    onClick={() => crumbTo(i)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!status?.connected ? (
              <p className="text-sm text-muted-foreground">Connect Drive to list files.</p>
            ) : peekLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-[min(420px,50vh)] pr-3">
                <ul className="space-y-1">
                  {peek?.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted transition-colors",
                          selectedFile?.id === item.id && "bg-muted",
                        )}
                        onClick={() => loadPreview(item)}
                      >
                        {item.isFolder ? (
                          <Folder className="w-4 h-4 shrink-0 text-amber-600" />
                        ) : (
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate flex-1">{item.name}</span>
                        {item.isFolder ? (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            folder
                          </Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                {peek?.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">This folder is empty.</p>
                ) : null}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[320px]">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-sky-600" />
                  Shadow Tree browser
                </CardTitle>
                <CardDescription className="mt-1">
                  Local map: folder hierarchy + AI summaries (after sync + map summaries). Drive browser is live
                  Drive; this is the DB mirror.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetchShadowTree()}
                disabled={shadowTreeLoading || !status?.connected}
              >
                <RefreshCw className={cn("w-4 h-4 mr-1", shadowTreeLoading && "animate-spin")} />
                Reload view
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!status?.connected ? (
              <p className="text-sm text-muted-foreground">Connect Drive to load the shadow tree.</p>
            ) : shadowTreeLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : shadowTreeError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load shadow tree</AlertTitle>
                <AlertDescription>{(shadowTreeError as Error).message}</AlertDescription>
              </Alert>
            ) : shadowTree ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {shadowTree.stats.folderCount} folders · {shadowTree.stats.documentCount} Drive-backed documents
                  in pilot scope.
                </p>
                <ScrollArea className="h-[min(420px,50vh)] pr-3">
                  <ShadowTreeNodeView node={shadowTree.root} depth={0} />
                </ScrollArea>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tree data.</p>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[280px] lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>
              {selectedFile ? selectedFile.name : "Select a file to pull text from Google Drive."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewResult ? (
              <div className="space-y-2">
                {previewResult.note ? (
                  <Alert>
                    <AlertTitle>{previewResult.previewKind === "unsupported" ? "No preview" : "Note"}</AlertTitle>
                    <AlertDescription>{previewResult.note}</AlertDescription>
                  </Alert>
                ) : null}
                {previewResult.text ? (
                  <ScrollArea className="h-[min(360px,45vh)] rounded-md border bg-muted/30 p-3">
                    <pre className="text-xs whitespace-pre-wrap font-mono">{previewResult.text}</pre>
                  </ScrollArea>
                ) : null}
                {verboseDebug && previewResult.debug ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Preview debug steps</summary>
                    <pre className="mt-2 p-2 rounded bg-muted overflow-x-auto">
                      {JSON.stringify(previewResult.debug, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Google Docs, Sheets (CSV), plain text, and PDFs support text preview here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {status?.connected ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              Shadow Tree Agent (Day 4)
            </CardTitle>
            <CardDescription>
              Uses the shadow map (folder + doc summaries in the DB) as optional context, then OpenAI tools{" "}
              <code className="text-xs bg-muted px-1 rounded">list_folder</code> and{" "}
              <code className="text-xs bg-muted px-1 rounded">read_document</code> for navigation and live file
              text. Requires <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch id="agent-tree-ctx" checked={includeTreeInAgent} onCheckedChange={setIncludeTreeInAgent} />
              <Label htmlFor="agent-tree-ctx" className="text-sm cursor-pointer">
                Include shadow map snapshot in prompt (recommended)
              </Label>
            </div>
            <Textarea
              value={agentQuestion}
              onChange={(e) => setAgentQuestion(e.target.value)}
              rows={3}
              className="text-sm resize-y min-h-[80px]"
              disabled={agentRunning}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void runShadowTreeAgent()} disabled={agentRunning}>
                {agentRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Ask agent
              </Button>
            </div>
            {agentResult?.answer ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                <p className="whitespace-pre-wrap">{agentResult.answer}</p>
                <p className="text-xs text-muted-foreground">
                  Rounds: {agentResult.rounds ?? "—"} · Tool calls: {agentResult.toolCallsExecuted ?? "—"}
                  {agentResult.rootFolderId != null ? ` · Root folder id: ${agentResult.rootFolderId}` : ""}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {verboseDebug && peek?.debug ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bug className="w-4 h-4" />
              Last folder list — debug
            </CardTitle>
            <CardDescription>Step timings and API details from the most recent peek request.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs p-3 rounded-md bg-muted overflow-x-auto max-h-64">
              {JSON.stringify(peek.debug, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Debug log</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLog([])}>
              Clear
            </Button>
          </div>
          <CardDescription>Recent API responses (verbose mode adds richer bodies from the server).</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-3 pr-3">
                {log.map((entry) => (
                  <div key={entry.id}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span>{entry.at}</span>
                      <Badge variant={entry.ok ? "secondary" : "destructive"}>{entry.label}</Badge>
                    </div>
                    <pre className="text-[10px] p-2 rounded bg-muted overflow-x-auto max-h-40">
                      {JSON.stringify(entry.payload, null, 2)}
                    </pre>
                    <Separator className="mt-3" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
