const MAX_TITLE_LENGTH = 120;

/** OSC titles come straight from the remote/local shell — strip control
 *  characters, normalize whitespace, cap length. Empty results → null so
 *  callers fall back to the tab's static base title. */
export function sanitizeTitle(raw: string): string | null {
  let cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, "")
    // zero-width/formatting chars and bidi overrides (can spoof tab labels)
    .replace(/[\u00ad\u200b-\u200d\u2060\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_TITLE_LENGTH);

  // don't leave a lone high surrogate dangling at the cap boundary
  const lastCode = cleaned.charCodeAt(cleaned.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cleaned = cleaned.slice(0, -1);
  }

  cleaned = cleaned.trim();
  return cleaned.length > 0 ? cleaned : null;
}
