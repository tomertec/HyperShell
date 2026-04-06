export type SortColumn = "name" | "size" | "modifiedAt" | "permissions";
export type SortDirection = "asc" | "desc";

export interface SortableEntry {
  name: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions?: number;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const size = bytes / Math.pow(1024, unitIndex);
  const precision = unitIndex === 0 ? 0 : 1;

  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const FILE_ICON_MAP: Record<string, string> = {
  ts: "file-code",
  tsx: "file-code",
  js: "file-code",
  jsx: "file-code",
  json: "file-json",
  yaml: "file-text",
  yml: "file-text",
  toml: "file-text",
  xml: "file-code",
  html: "file-code",
  css: "file-code",
  md: "file-text",
  txt: "file-text",
  log: "file-text",
  png: "file-image",
  jpg: "file-image",
  jpeg: "file-image",
  gif: "file-image",
  svg: "file-image",
  webp: "file-image",
  zip: "file-archive",
  tar: "file-archive",
  gz: "file-archive",
  pdf: "file-pdf",
  sh: "file-terminal",
  bash: "file-terminal",
  zsh: "file-terminal"
};

export function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) {
    return "folder";
  }

  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICON_MAP[extension] ?? "file";
}

function toTimeValue(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareValues(
  left: SortableEntry,
  right: SortableEntry,
  column: SortColumn
): number {
  switch (column) {
    case "name":
      return left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
        numeric: true
      });
    case "size":
      return left.size - right.size;
    case "modifiedAt":
      return toTimeValue(left.modifiedAt) - toTimeValue(right.modifiedAt);
    case "permissions":
      return (left.permissions ?? 0) - (right.permissions ?? 0);
    default:
      return 0;
  }
}

export function sortEntries<T extends SortableEntry>(
  entries: T[],
  column: SortColumn,
  direction: SortDirection
): T[] {
  const sorted = [...entries].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) {
      return left.isDirectory ? -1 : 1;
    }

    const comparison = compareValues(left, right, column);
    if (comparison !== 0) {
      return direction === "asc" ? comparison : -comparison;
    }

    const fallback = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true
    });
    return direction === "asc" ? fallback : -fallback;
  });

  return sorted;
}

export function getParentPath(path: string): string {
  if (!path) {
    return "/";
  }

  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length === 0) {
    return "/";
  }

  if (/^[a-zA-Z]:$/.test(normalized)) {
    return `${normalized}\\`;
  }

  const lastSeparator = normalized.lastIndexOf("/");
  if (lastSeparator <= 0) {
    return normalized.startsWith("/") ? "/" : "";
  }

  return normalized.slice(0, lastSeparator);
}

export function joinRemotePath(base: string, name: string): string {
  const normalizedBase = base.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedBase) {
    return `/${name}`;
  }

  return `${normalizedBase}/${name}`;
}
