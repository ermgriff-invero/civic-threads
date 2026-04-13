/**
 * Manual uploads are a separate “connector” in the municipal tree: use `knowledge_folders` rows
 * with `connectionId = null` and stable synthetic `externalId` values under the same `tenantKey`
 * as Drive-backed folders. Seed a root row (e.g. {@link MANUAL_UPLOAD_ROOT_EXTERNAL_ID}) in Day 2+.
 */
export const MANUAL_UPLOAD_ROOT_EXTERNAL_ID = "connector:manual-upload-root";
