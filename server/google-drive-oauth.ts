/**
 * @deprecated Import from `server/connectors/google-drive/` for new code.
 * Re-exports keep existing `routes.ts` import path stable.
 */
export { registerGoogleDriveConnectorRoutes as registerGoogleDriveOAuthRoutes } from "./connectors/google-drive/routes";
export { warnIfGoogleDriveUnconfigured } from "./connectors/google-drive/config";
