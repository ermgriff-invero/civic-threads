import { google } from "googleapis";
import { getGoogleOAuthRedirectUri, GOOGLE_DRIVE_READONLY_SCOPE } from "./config";

export function getGoogleDriveOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getGoogleOAuthRedirectUri();
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId.trim(), clientSecret.trim(), redirectUri);
}

export function buildGoogleDriveConsentUrl(state: string): string {
  const oauth2 = getGoogleDriveOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_DRIVE_READONLY_SCOPE],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeGoogleDriveAuthCode(code: string) {
  const oauth2 = getGoogleDriveOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}
