/**
 * Canonical "turn an unknown thrown value into a human-readable string" helper.
 * Replaces the per-module `toErrorMessage` / `getErrorMessage` copies across the
 * transports, IPC handlers, and UI. Pass a `fallback` for a domain-specific
 * message when the error carries no usable text.
 */
export function toErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  const asString = String(error ?? "").trim();
  return asString.length > 0 ? asString : fallback;
}
