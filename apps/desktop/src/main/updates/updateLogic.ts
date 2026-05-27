export function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(current: string, candidate: string): boolean {
  const a = parseSemver(current);
  const b = parseSemver(candidate);
  if (!a || !b) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (b[index] > a[index]) {
      return true;
    }
    if (b[index] < a[index]) {
      return false;
    }
  }
  return false;
}

export interface ParsedRelease {
  version: string;
  htmlUrl: string;
}

export function parseLatestRelease(payload: unknown): ParsedRelease | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.draft === true || record.prerelease === true) {
    return null;
  }

  const tag = record.tag_name;
  const htmlUrl = record.html_url;
  if (typeof tag !== "string" || typeof htmlUrl !== "string") {
    return null;
  }

  const version = tag.replace(/^v/i, "");
  if (!parseSemver(version)) {
    return null;
  }

  return { version, htmlUrl };
}
