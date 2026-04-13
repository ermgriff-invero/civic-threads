/** Read-only file access for summaries + live fetch (Shadow Tree). */
export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function isGoogleDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function getGoogleOAuthRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ??
    "http://127.0.0.1:5000/api/integrations/google-drive/callback"
  );
}

export function warnIfGoogleDriveUnconfigured(): void {
  if (!isGoogleDriveConfigured()) {
    console.warn(
      "Google Drive OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Shadow Tree sync will stay disabled until set.",
    );
  }
}
