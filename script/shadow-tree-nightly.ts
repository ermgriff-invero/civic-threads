#!/usr/bin/env npx tsx
/**
 * Cron-friendly: dirty-only map summarization for the shadow tree pilot.
 * Requires DATABASE_URL, OPENAI_API_KEY, and a linked Google Drive connection for the tenant.
 *
 * Usage:
 *   SHADOW_TREE_TENANT_KEY=ct-shared npm run shadow-tree:nightly
 */
import "dotenv/config";
import { storage } from "../server/storage";
import { runShadowTreeMapSummarization } from "../server/connectors/google-drive/summarization-worker";

const SCOPED_ROOT_NAME = "Civic Threads pilot";

async function main() {
  const tenantKey = process.env.SHADOW_TREE_TENANT_KEY?.trim() ?? "ct-shared";
  const conn = await storage.getGoogleDriveConnectionForTenant(tenantKey);
  if (!conn) {
    console.error(`No Google Drive connection for tenant "${tenantKey}".`);
    process.exitCode = 1;
    return;
  }

  const maxCompletionTokens = Math.max(
    100,
    Math.min(1600, parseInt(process.env.SHADOW_TREE_SUMMARY_MAX_TOKENS ?? "400", 10) || 400),
  );
  const maxDocs = Math.max(
    1,
    Math.min(100, parseInt(process.env.SHADOW_TREE_SUMMARY_MAX_DOCS ?? "50", 10) || 50),
  );

  const result = await runShadowTreeMapSummarization({
    tenantKey,
    refreshToken: conn.refreshToken,
    scopedRootName: SCOPED_ROOT_NAME,
    maxCompletionTokens,
    maxDocs,
    dirtyOnly: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantKey: result.tenantKey,
        dirtyOnly: result.dirtyOnly,
        finishedAt: result.finishedAt,
        docsConsidered: result.docsConsidered,
        docsSummarized: result.docsSummarized,
        docsFirstSummarized: result.docsFirstSummarized,
        docsRegenerated: result.docsRegenerated,
        foldersSummarized: result.foldersSummarized,
        foldersFirstSummarized: result.foldersFirstSummarized,
        foldersRegenerated: result.foldersRegenerated,
        foldersDirtyClearedNoRollup: result.foldersDirtyClearedNoRollup,
        docFailures: result.docFailures.length,
        folderFailures: result.folderFailures.length,
        mapSnapshot: result.mapSnapshot,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
