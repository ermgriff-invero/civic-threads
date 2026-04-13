/**
 * Tenant key for Shadow Tree data (Drive connection, folder map, future manual connector).
 * Pilot: one shared Drive for all of Civic Threads → default `ct-shared`.
 * Production: set `SHADOW_TREE_TENANT_KEY` per deployment, or leave unset and use each user's `municipality` profile field.
 */
export function resolveShadowTreeTenantKey(municipality: string | null | undefined): string {
  const fromEnv = process.env.SHADOW_TREE_TENANT_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const m = municipality?.trim();
  if (m) {
    const slug = m
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return slug ? `city:${slug}` : "city:unknown";
  }
  return "ct-shared";
}
