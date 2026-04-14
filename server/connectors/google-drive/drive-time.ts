/** Parse Drive RFC3339 `modifiedTime` to epoch ms for stable comparisons. */
export function driveModifiedTimeToEpochMs(iso: string | undefined): number | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function driveEpochMsFromDate(d: Date | null | undefined): number | null {
  if (!d) return null;
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True when Drive reports a different revision than we stored. */
export function driveRevisionChanged(
  stored: Date | null | undefined,
  driveIso: string | undefined,
): boolean {
  const a = driveEpochMsFromDate(stored ?? undefined);
  const b = driveModifiedTimeToEpochMs(driveIso);
  if (b === null) return a !== null;
  if (a === null) return true;
  return a !== b;
}
