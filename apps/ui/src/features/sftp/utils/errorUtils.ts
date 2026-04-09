export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const asString = String(error ?? "").trim();
  return asString.length > 0 ? asString : fallback;
}
