#!/usr/bin/env npx tsx
/**
 * Quick local checks for Google Drive connector env (no network, no OAuth).
 * Run: npm run check:drive-env
 */
import "dotenv/config";

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const redirect =
  process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ??
  "http://127.0.0.1:5000/api/integrations/google-drive/callback";
const tenant = process.env.SHADOW_TREE_TENANT_KEY?.trim() ?? "(unset → ct-shared or city:<profile>)";

console.log("--- Shadow Tree / Google Drive (local checks) ---");
console.log("GOOGLE_CLIENT_ID:     ", clientId ? `set (${clientId.slice(0, 8)}…)` : "MISSING");
console.log("GOOGLE_CLIENT_SECRET:", secret ? "set" : "MISSING");
console.log("GOOGLE_OAUTH_REDIRECT_URI:", redirect);
console.log("SHADOW_TREE_TENANT_KEY:   ", tenant);
console.log("");

if (!clientId || !secret) {
  console.log(
    "Next: Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web).",
  );
  console.log("Authorized redirect URI must match exactly:");
  console.log(" ", redirect);
  process.exitCode = 1;
} else {
  console.log("Env looks sufficient to start OAuth. Log in, then open:");
  console.log(" ", "GET /api/integrations/google-drive/start (same origin as the app, with session cookie).");
  console.log("After linking: GET /api/integrations/google-drive/peek?parent=root (lists My Drive top level).");
  console.log("");
  console.log("Google Cloud checklist:");
  console.log("  - Enable “Google Drive API” for this project (APIs & Services → Library).");
  console.log("  - OAuth consent screen: if Testing, add your Google account under Test users.");
  console.log("  - Web client: Authorized redirect URI must match GOOGLE_OAUTH_REDIRECT_URI exactly.");
}
