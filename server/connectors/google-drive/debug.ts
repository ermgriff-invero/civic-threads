/**
 * Structured errors + timing for Google Drive troubleshooting (KB 2.0 / admin tools).
 */

export type DriveDebugStep = {
  step: string;
  ms: number;
  ok?: boolean;
  detail?: Record<string, unknown>;
};

export function serializeGoogleDriveError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const response = o.response as { status?: number; statusText?: string; data?: unknown } | undefined;
    if (response) {
      return {
        type: "google_api_response",
        httpStatus: response.status,
        statusText: response.statusText,
        body: response.data,
      };
    }
    if (err instanceof Error) {
      return {
        type: "error",
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
      };
    }
  }
  if (err instanceof Error) {
    return {
      type: "error",
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    };
  }
  return { type: "unknown", message: String(err) };
}

export async function driveDebugTimed<T>(
  steps: DriveDebugStep[],
  step: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    steps.push({ step, ms: Date.now() - t0, ok: true });
    return result;
  } catch (e) {
    steps.push({
      step,
      ms: Date.now() - t0,
      ok: false,
      detail: serializeGoogleDriveError(e),
    });
    throw e;
  }
}
