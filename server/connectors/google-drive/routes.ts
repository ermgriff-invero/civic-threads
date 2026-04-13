import type { Express, Request, Response } from "express";
import { Router } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { db } from "../../db";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth";
import { resolveShadowTreeTenantKey } from "../shadow-tree-tenant";
import {
  GOOGLE_DRIVE_READONLY_SCOPE,
  getGoogleOAuthRedirectUri,
  isGoogleDriveConfigured,
} from "./config";
import { buildGoogleDriveConsentUrl, exchangeGoogleDriveAuthCode } from "./oauth-client";
import { getDriveAbout, listFolderChildren, resolveRootFolderByExactName } from "./drive-api";
import { previewDriveFile } from "./drive-preview";
import { type DriveDebugStep, driveDebugTimed, serializeGoogleDriveError } from "./debug";
import { runScopedDriveSync } from "./sync";
import { runShadowTreeMapSummarization } from "./summarization-worker";
import { runShadowTreeAgentQuery } from "./shadow-tree-agent";
import { executeListFolderTool, executeReadDocumentTool } from "./shadow-tree-agent-tools";
import { getShadowTreeHierarchy } from "./shadow-tree-hierarchy";
import { asNonStreamingChatCompletion, getOpenAI, userVisibleOpenAIRouteError } from "../../openai-client";

function parseParentId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return "root";
  }
  if (typeof raw !== "string") {
    return null;
  }
  if (raw === "root") {
    return "root";
  }
  if (raw.length > 512 || !/^[-_a-zA-Z0-9]+$/.test(raw)) {
    return null;
  }
  return raw;
}

function parseDriveFileId(raw: string): string | null {
  if (!raw || raw.length > 512 || !/^[-_a-zA-Z0-9]+$/.test(raw)) {
    return null;
  }
  return raw;
}

function wantsVerboseDriveDebug(req: Request): boolean {
  const d = req.query.debug;
  return d === "1" || d === "true" || d === "yes";
}

function wantsDryRun(req: Request): boolean {
  const q = req.query.dryRun;
  const b = (req.body as { dryRun?: unknown } | undefined)?.dryRun;
  return q === "1" || q === "true" || q === "yes" || b === true || b === "true";
}

async function tenantKeyForUserId(userId: string): Promise<string> {
  const [u] = await db
    .select({ municipality: users.municipality })
    .from(users)
    .where(eq(users.id, userId));
  return resolveShadowTreeTenantKey(u?.municipality ?? undefined);
}

function sendConfigRequired(res: Response) {
  return res.status(503).json({
    message:
      "Google Drive integration is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment.",
  });
}

/**
 * Google Drive connector (Shadow Tree Day 1). Any signed-in user can connect/browse for solo pilot;
 * tighten to `requireRole("ADMIN")` before multi-tenant production.
 */
export function registerGoogleDriveConnectorRoutes(app: Express): void {
  const r = Router();
  r.use(isAuthenticated);
  const scopedRootName = "Civic Threads pilot";

  r.get("/status", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return res.json({ configured: false, connected: false, tenantKey: null });
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const row = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    return res.json({
      configured: true,
      connected: Boolean(row),
      tenantKey,
    });
  });

  r.get("/scope", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({
        message: "No Google Drive linked for this tenant. Visit /api/integrations/google-drive/start first.",
        tenantKey,
        rootName: scopedRootName,
      });
    }
    try {
      const scope = await resolveRootFolderByExactName(conn.refreshToken, scopedRootName);
      return res.json({
        tenantKey,
        rootName: scope.folderName,
        rootId: scope.folderId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({
        message: msg,
        tenantKey,
        rootName: scopedRootName,
      });
    }
  });

  r.post("/sync", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const verbose = wantsVerboseDriveDebug(req);
    const dryRun = wantsDryRun(req);
    const steps: DriveDebugStep[] = [];

    try {
      const result = verbose
        ? await driveDebugTimed(steps, "runScopedDriveSync", () =>
            runScopedDriveSync({
              tenantKey,
              dryRun,
              debug: verbose,
            }),
          )
        : await runScopedDriveSync({
            tenantKey,
            dryRun,
            debug: verbose,
          });
      return res.json({
        ok: true,
        ...result,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        ok: false,
        message,
        google: serializeGoogleDriveError(error),
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    }
  });

  r.get("/verify", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({
        message: "No Google Drive linked for this tenant.",
        tenantKey,
      });
    }
    const scope = await resolveRootFolderByExactName(conn.refreshToken, scopedRootName);
    const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
    const root = folders.find((f) => f.externalId === scope.folderId);
    if (!root) {
      return res.json({
        ok: false,
        tenantKey,
        rootName: scopedRootName,
        rootId: scope.folderId,
        message: "Root folder has not been synced yet. Run sync first.",
      });
    }

    const descendants = new Set<number>([root.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentId !== null && descendants.has(f.parentId) && !descendants.has(f.id)) {
          descendants.add(f.id);
          changed = true;
        }
      }
    }
    const subtreeFolderIds = Array.from(descendants);
    const subtreeDocs = await storage.getDriveDocumentsByFolderIds(subtreeFolderIds);
    const allDocs = await storage.getDocuments();
    const allDriveDocs = allDocs.filter((d) => d.sourceSystem === "gdrive");
    const outOfScopeDocs = allDriveDocs.filter(
      (d) => d.folderId !== null && !descendants.has(d.folderId),
    );

    return res.json({
      ok: true,
      tenantKey,
      rootName: scopedRootName,
      rootId: scope.folderId,
      foldersInSubtree: subtreeFolderIds.length,
      driveDocsInSubtree: subtreeDocs.length,
      totalDriveDocs: allDriveDocs.length,
      outOfScopeDriveDocs: outOfScopeDocs.length,
      sample: {
        folders: folders
          .filter((f) => descendants.has(f.id))
          .slice(0, 5)
          .map((f) => ({ id: f.id, title: f.title, externalId: f.externalId, parentId: f.parentId })),
        docs: subtreeDocs.slice(0, 5).map((d) => ({
          id: d.id,
          title: d.title,
          folderId: d.folderId,
          externalId: d.externalId,
          sourceSystem: d.sourceSystem,
        })),
      },
    });
  });

  r.post("/summaries/sample", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }
    const scope = await resolveRootFolderByExactName(conn.refreshToken, scopedRootName);
    const folders = await storage.getKnowledgeFoldersForTenant(tenantKey);
    const root = folders.find((f) => f.externalId === scope.folderId);
    if (!root) {
      return res.status(400).json({ message: "Run sync first. Scoped root is not in local shadow tree yet." });
    }

    const descendants = new Set<number>([root.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentId !== null && descendants.has(f.parentId) && !descendants.has(f.id)) {
          descendants.add(f.id);
          changed = true;
        }
      }
    }
    const docs = await storage.getDriveDocumentsByFolderIds(Array.from(descendants));
    const candidate = docs.find((d) => d.externalId);
    if (!candidate || !candidate.externalId) {
      return res.status(400).json({ message: "No synced Drive document available for sample summary." });
    }

    const preview = await previewDriveFile(conn.refreshToken, candidate.externalId);
    if (!preview.text?.trim()) {
      return res.status(400).json({
        message: "Sample document has no extractable text preview. Pick another file type.",
        docId: candidate.id,
        docTitle: candidate.title,
      });
    }

    const maxFromReq =
      typeof (req.body as { maxCompletionTokens?: unknown } | undefined)?.maxCompletionTokens === "number"
        ? Number((req.body as { maxCompletionTokens: number }).maxCompletionTokens)
        : undefined;
    const envMax = parseInt(process.env.SHADOW_TREE_SUMMARY_MAX_TOKENS ?? "400", 10);
    const maxCompletionTokens = Math.max(100, Math.min(1200, maxFromReq ?? envMax));
    const verbose = wantsVerboseDriveDebug(req);
    const steps: DriveDebugStep[] = [];
    const promptText = `Document title: ${candidate.title}\n\nDocument text:\n${preview.text.slice(0, 12000)}`;
    const promptChars = promptText.length;

    try {
      const summaryModel = process.env.SHADOW_TREE_SUMMARY_MODEL?.trim() || "gpt-4o-mini";
      const chatRequest: Parameters<ReturnType<typeof getOpenAI>["chat"]["completions"]["create"]>[0] = {
        model: summaryModel,
        messages: [
          {
            role: "system",
            content:
              "Summarize municipal/government documents in one concise paragraph with specific entities, dates, and decisions.",
          },
          {
            role: "user",
            content: promptText,
          },
        ],
        max_completion_tokens: maxCompletionTokens,
        stream: false,
      };
      // Some lower-cost models (e.g. gpt-5-nano) only support default temperature.
      if (!summaryModel.startsWith("gpt-5")) {
        (chatRequest as { temperature?: number }).temperature = 0.2;
      }
      const completion = asNonStreamingChatCompletion(
        verbose
          ? await driveDebugTimed(steps, "openai.chat.completions.create", () =>
              getOpenAI().chat.completions.create(chatRequest),
            )
          : await getOpenAI().chat.completions.create(chatRequest),
      );

      const summary = completion.choices[0]?.message?.content?.trim();
      if (!summary) {
        const firstChoice = completion.choices[0];
        return res.status(502).json({
          message: "OpenAI returned empty summary.",
          model: summaryModel,
          maxCompletionTokens,
          promptChars,
          openaiMeta: {
            finishReason: firstChoice?.finish_reason ?? null,
            refusal: firstChoice?.message?.refusal ?? null,
            contentLength: firstChoice?.message?.content?.length ?? 0,
            usage: completion.usage ?? null,
          },
          ...(verbose ? { debug: { steps, at: new Date().toISOString(), chatRequest } } : {}),
        });
      }

      await storage.updateDocument(candidate.id, {
        description: `AI summary: ${summary}`,
        processingStatus: "summarized",
        indexed: true,
      });

      return res.json({
        ok: true,
        tenantKey,
        docId: candidate.id,
        docTitle: candidate.title,
        model: summaryModel,
        maxCompletionTokens,
        promptChars,
        usage: completion.usage ?? null,
        summary,
        ...(verbose
          ? {
              debug: {
                steps,
                at: new Date().toISOString(),
                finishReason: completion.choices[0]?.finish_reason ?? null,
              },
            }
          : {}),
      });
    } catch (error) {
      const serialized = serializeGoogleDriveError(error);
      const msg =
        error instanceof Error
          ? error.message
          : "OpenAI request failed while generating sample summary.";
      const lower = msg.toLowerCase();
      const quota =
        lower.includes("insufficient_quota") ||
        lower.includes("exceeded your current quota") ||
        lower.includes("429");
      return res.status(quota ? 429 : 502).json({
        message: quota
          ? "OpenAI quota exceeded. Add billing/credits or use another key, then retry Sample Summary."
          : "OpenAI request failed while generating sample summary.",
        model: process.env.SHADOW_TREE_SUMMARY_MODEL?.trim() || "gpt-4o-mini",
        maxCompletionTokens,
        promptChars,
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
        openai: serialized,
        ...(verbose ? { debug: { steps, at: new Date().toISOString(), chatRequestPreview: "omitted" } } : {}),
      });
    }
  });

  r.post("/summaries/run", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }

    const verbose = wantsVerboseDriveDebug(req);
    const steps: DriveDebugStep[] = [];
    const maxFromReq =
      typeof (req.body as { maxCompletionTokens?: unknown } | undefined)?.maxCompletionTokens === "number"
        ? Number((req.body as { maxCompletionTokens: number }).maxCompletionTokens)
        : undefined;
    const envMax = parseInt(process.env.SHADOW_TREE_SUMMARY_MAX_TOKENS ?? "400", 10);
    const maxCompletionTokens = Math.max(100, Math.min(1600, maxFromReq ?? envMax));
    const maxDocsRaw = (req.body as { maxDocs?: unknown } | undefined)?.maxDocs;
    const envMaxDocs = parseInt(process.env.SHADOW_TREE_SUMMARY_MAX_DOCS ?? "50", 10);
    const maxDocs =
      typeof maxDocsRaw === "number" && Number.isFinite(maxDocsRaw)
        ? Math.max(1, Math.min(100, Math.floor(maxDocsRaw)))
        : Math.max(1, Math.min(100, Number.isFinite(envMaxDocs) ? envMaxDocs : 50));

    try {
      const result = await runShadowTreeMapSummarization({
        tenantKey,
        refreshToken: conn.refreshToken,
        scopedRootName,
        verbose,
        steps,
        maxCompletionTokens,
        maxDocs,
      });
      return res.json({
        ok: true,
        tenantKey: result.tenantKey,
        model: result.model,
        maxCompletionTokens: result.maxCompletionTokens,
        scope: result.scope,
        docsConsidered: result.docsConsidered,
        docsSummarized: result.docsSummarized,
        docFailures: result.docFailures,
        folderFailures: result.folderFailures,
        foldersSummarized: result.foldersSummarized,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    } catch (error) {
      const setupMsg = userVisibleOpenAIRouteError(error);
      if (setupMsg) {
        return res.status(503).json({ message: setupMsg });
      }
      const msg = error instanceof Error ? error.message : String(error);
      const lower = msg.toLowerCase();
      const quota =
        lower.includes("insufficient_quota") ||
        lower.includes("exceeded your current quota") ||
        lower.includes("429");
      if (msg === "Run sync first. Scoped root is not in local shadow tree yet.") {
        return res.status(400).json({ message: msg });
      }
      return res.status(quota ? 429 : 502).json({
        message: quota
          ? "OpenAI quota exceeded. Add billing/credits or use another key, then retry Run Full Summaries."
          : "Map summarization failed.",
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    }
  });

  /** Safe, no-secrets snapshot for troubleshooting (see KB 2.0 “Debug Google Drive”). */
  r.get("/diagnostics", async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    let tenantKey: string | null = null;
    if (userId) {
      tenantKey = await tenantKeyForUserId(userId);
    }
    const row = tenantKey ? await storage.getGoogleDriveConnectionForTenant(tenantKey) : undefined;
    const cid = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
    return res.json({
      at: new Date().toISOString(),
      notes: {
        backgroundJs:
          "Errors mentioning background.js / FrameDoesNotExistError usually come from a browser extension (password manager, etc.), not this app.",
        connectionRefused:
          "net::ERR_CONNECTION_REFUSED on /api/... means the Node/Vite server is not running on this origin/port or just restarted.",
      },
      server: {
        nodeEnv: process.env.NODE_ENV ?? "development",
      },
      googleOAuth: {
        configured: isGoogleDriveConfigured(),
        clientIdLength: cid.length,
        clientIdPrefix: cid ? `${cid.slice(0, 12)}…` : null,
        clientSecretPresent: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
        redirectUri: getGoogleOAuthRedirectUri(),
        scope: GOOGLE_DRIVE_READONLY_SCOPE,
      },
      session: {
        authenticated: Boolean(userId),
      },
      tenant: { key: tenantKey },
      connection: {
        rowExists: Boolean(row),
        hasRefreshToken: Boolean(row?.refreshToken && row.refreshToken.length > 0),
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      },
    });
  });

  r.get("/start", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const state = randomBytes(24).toString("hex");
    req.session!.googleDriveOAuthState = state;
    req.session!.save((err) => {
      if (err) {
        console.error("Session save failed before Google OAuth redirect:", err);
        return res.status(500).json({ message: "Could not start OAuth flow" });
      }
      try {
        const url = buildGoogleDriveConsentUrl(state);
        return res.redirect(302, url);
      } catch (e) {
        console.error("Google OAuth URL build failed:", e);
        return res.status(500).json({ message: "OAuth configuration error" });
      }
    });
  });

  r.get("/callback", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).send("Unauthorized — sign in as an admin, then try connecting again.");
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const expected = req.session.googleDriveOAuthState;
    if (!code || !state || !expected || state !== expected) {
      return res.status(400).send("Invalid or expired OAuth state. Start the connection again from the app.");
    }
    delete req.session.googleDriveOAuthState;

    try {
      const tokens = await exchangeGoogleDriveAuthCode(code);
      const existing = await storage.getGoogleDriveConnectionForTenant(tenantKey);
      const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
      if (!refreshToken) {
        return res.status(400).send(
          "Google did not return a refresh token. Open Google Account → Security → Third-party access, " +
            "remove access for this app, then connect again so we can store offline access.",
        );
      }
      await storage.upsertGoogleDriveConnection({
        tenantKey,
        userId,
        refreshToken,
      });
      return res.redirect(302, "/knowledge-base-2?drive=connected");
    } catch (e) {
      console.error("Google OAuth token exchange failed:", e);
      return res.status(502).send("Could not complete Google sign-in. Check server logs.");
    }
  });

  r.post("/disconnect", async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    await storage.deleteGoogleDriveConnectionForTenant(tenantKey);
    return res.json({ ok: true, tenantKey });
  });

  /**
   * List one folder level from the linked Google account. Query: `debug=1` adds step timings + Google error bodies.
   */
  r.get("/peek", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({
        message: "No Google Drive linked for this tenant. Visit /api/integrations/google-drive/start first.",
        tenantKey,
      });
    }

    const parent = parseParentId(req.query.parent);
    if (parent === null) {
      return res.status(400).json({ message: "Invalid parent id. Use root or a Drive folder id." });
    }
    const limitRaw = req.query.limit;
    const limit =
      typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? Math.min(100, Math.max(1, parseInt(limitRaw, 10)))
        : 50;

    const verbose = wantsVerboseDriveDebug(req);
    const steps: DriveDebugStep[] = [];

    try {
      let about: Awaited<ReturnType<typeof getDriveAbout>>;
      let listResult: Awaited<ReturnType<typeof listFolderChildren>>;
      if (verbose) {
        about = await driveDebugTimed(steps, "about.get", () => getDriveAbout(conn.refreshToken));
        listResult = await driveDebugTimed(steps, "files.list(children)", () =>
          listFolderChildren(conn.refreshToken, parent, limit),
        );
      } else {
        [about, listResult] = await Promise.all([
          getDriveAbout(conn.refreshToken),
          listFolderChildren(conn.refreshToken, parent, limit),
        ]);
      }
      return res.json({
        tenantKey,
        parent,
        user: about.user ?? null,
        itemCount: listResult.items.length,
        nextPageToken: listResult.nextPageToken ?? null,
        items: listResult.items,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    } catch (e) {
      console.error("Google Drive peek failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(502).json({
        message: "Drive API request failed. Ensure Drive API is enabled and the OAuth consent screen allows this user.",
        google: serializeGoogleDriveError(e),
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    }
  });

  /**
   * Nested shadow tree (DB): folder AI summaries + document summary snippets under Civic Threads pilot.
   */
  r.get("/shadow-tree/tree", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }
    const result = await getShadowTreeHierarchy(tenantKey, conn.refreshToken);
    if (!result.ok) {
      return res.status(400).json({ message: result.error, tenantKey });
    }
    return res.json({
      tenantKey,
      root: result.root,
      stats: result.stats,
    });
  });

  /**
   * Day 4 — direct tool tests (same logic as agent tools; no LLM).
   * Query: folderId / documentId = database ids from Verify or list_folder.
   *
   * Text-oriented file preview for KB 2.0 (Docs/Sheets/Slides export, text/*, PDF text extract).
   * Query: `debug=1` adds per-step timings.
   */
  r.get("/shadow-tree/tools/list-folder", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }
    const raw = req.query.folderId;
    const folderId =
      typeof raw === "string" && /^\d+$/.test(raw) ? parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
    if (!Number.isFinite(folderId) || folderId < 1) {
      return res.status(400).json({ message: "Query folderId must be a positive integer (knowledge_folders.id)." });
    }
    try {
      const result = await executeListFolderTool({
        tenantKey,
        refreshToken: conn.refreshToken,
        folderId,
      });
      return res.json({ tenantKey, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(502).json({ message: msg });
    }
  });

  r.get("/shadow-tree/tools/read-document", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }
    const raw = req.query.documentId;
    const documentId =
      typeof raw === "string" && /^\d+$/.test(raw) ? parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
    if (!Number.isFinite(documentId) || documentId < 1) {
      return res.status(400).json({ message: "Query documentId must be a positive integer (documents.id)." });
    }
    try {
      const result = await executeReadDocumentTool({
        tenantKey,
        refreshToken: conn.refreshToken,
        documentId,
      });
      return res.json({ tenantKey, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(502).json({ message: msg });
    }
  });

  /** Day 4 — OpenAI tool-calling agent (list_folder + read_document). */
  r.post("/shadow-tree/query", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({ message: "No Google Drive linked for this tenant." });
    }
    const q =
      typeof (req.body as { question?: unknown })?.question === "string"
        ? (req.body as { question: string }).question.trim()
        : "";
    if (!q) {
      return res.status(400).json({ message: "Body must include { question: string }." });
    }
    const includeTreeContextRaw = (req.body as { includeTreeContext?: unknown })?.includeTreeContext;
    const includeTreeContext =
      includeTreeContextRaw === undefined ? true : Boolean(includeTreeContextRaw);

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return res.status(503).json({
        message:
          "OpenAI is not configured. Add OPENAI_API_KEY to your .env file in the project root, then restart the dev server.",
      });
    }

    try {
      const result = await runShadowTreeAgentQuery({
        tenantKey,
        refreshToken: conn.refreshToken,
        question: q,
        includeTreeContext,
      });
      if (!result.ok) {
        return res.status(400).json({ ok: false, message: result.error });
      }
      return res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const lower = msg.toLowerCase();
      const quota =
        lower.includes("insufficient_quota") ||
        lower.includes("exceeded your current quota") ||
        lower.includes("429");
      return res.status(quota ? 429 : 502).json({
        message: quota ? "OpenAI quota exceeded." : msg,
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
      });
    }
  });

  r.get("/files/:fileId/preview", async (req: Request, res: Response) => {
    if (!isGoogleDriveConfigured()) {
      return sendConfigRequired(res);
    }
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const fileId = parseDriveFileId(req.params.fileId);
    if (!fileId) {
      return res.status(400).json({ message: "Invalid file id." });
    }
    const tenantKey = await tenantKeyForUserId(userId);
    const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
    if (!conn) {
      return res.status(400).json({
        message: "No Google Drive linked for this tenant.",
        tenantKey,
      });
    }

    const verbose = wantsVerboseDriveDebug(req);
    const steps: DriveDebugStep[] = [];

    try {
      const result = await previewDriveFile(conn.refreshToken, fileId, verbose ? steps : undefined);
      return res.json({
        tenantKey,
        ...result,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    } catch (e) {
      console.error("Google Drive file preview failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(502).json({
        message: "Drive preview failed.",
        google: serializeGoogleDriveError(e),
        detail: process.env.NODE_ENV === "production" ? undefined : msg,
        ...(verbose ? { debug: { steps, at: new Date().toISOString() } } : {}),
      });
    }
  });

  app.use("/api/integrations/google-drive", r);
}
