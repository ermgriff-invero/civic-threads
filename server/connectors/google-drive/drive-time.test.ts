import { describe, expect, it } from "vitest";
import { driveEpochMsFromDate, driveModifiedTimeToEpochMs, driveRevisionChanged } from "./drive-time";

describe("drive-time", () => {
  it("parses Drive modifiedTime to epoch ms", () => {
    const ms = driveModifiedTimeToEpochMs("2024-01-15T12:00:00.000Z");
    expect(ms).toBe(Date.parse("2024-01-15T12:00:00.000Z"));
  });

  it("detects revision change vs stored Date", () => {
    const stored = new Date("2024-01-01T00:00:00.000Z");
    expect(driveRevisionChanged(stored, "2024-01-01T00:00:00.000Z")).toBe(false);
    expect(driveRevisionChanged(stored, "2024-02-01T00:00:00.000Z")).toBe(true);
    expect(driveRevisionChanged(undefined, "2024-01-01T00:00:00.000Z")).toBe(true);
  });

  it("driveEpochMsFromDate handles null", () => {
    expect(driveEpochMsFromDate(null)).toBeNull();
  });
});
