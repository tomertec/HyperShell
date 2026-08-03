const MAX_TITLE_LENGTH = 120;

/** OSC titles come straight from the remote/local shell — strip control
 *  characters, normalize whitespace, cap length. Empty results → null so
 *  callers fall back to the tab's static base title. */
export function sanitizeTitle(raw: string): string | null {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
