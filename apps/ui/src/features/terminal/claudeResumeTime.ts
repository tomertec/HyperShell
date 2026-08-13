const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Coarse relative time for the resume prompt — "3 hours ago", "yesterday". */
export function formatLastActive(isoTimestamp: string, now: number = Date.now()): string {
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const elapsed = now - timestamp;
  if (elapsed < MINUTE) {
    return "just now";
  }

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days === 1) {
    return "yesterday";
  }

  return `${days} days ago`;
}
