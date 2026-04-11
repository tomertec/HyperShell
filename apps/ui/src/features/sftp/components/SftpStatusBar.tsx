import { useMemo } from "react";
import type { FileListEntry } from "./FileList";
import { formatFileSize } from "../utils/fileUtils";

interface SftpStatusBarProps {
  entries: FileListEntry[];
  selection: Set<string>;
}

function summarize(items: FileListEntry[]) {
  let files = 0;
  let folders = 0;
  let totalSize = 0;
  for (const e of items) {
    if (e.isDirectory) {
      folders++;
    } else {
      files++;
      totalSize += e.size;
    }
  }
  return { files, folders, totalSize };
}

function formatCounts(files: number, folders: number): string {
  const parts: string[] = [];
  if (folders > 0) parts.push(`${folders} folder${folders !== 1 ? "s" : ""}`);
  if (files > 0) parts.push(`${files} file${files !== 1 ? "s" : ""}`);
  return parts.join(", ") || "Empty";
}

export function SftpStatusBar({ entries, selection }: SftpStatusBarProps) {
  const stats = useMemo(() => summarize(entries), [entries]);

  const selectionStats = useMemo(() => {
    if (selection.size === 0) return null;
    const selected = entries.filter((e) => selection.has(e.path));
    return summarize(selected);
  }, [entries, selection]);

  return (
    <div className="flex items-center justify-between border-t border-base-700 bg-base-900/80 px-2 py-0.5 text-[10px] text-text-secondary">
      <span>
        {formatCounts(stats.files, stats.folders)} — {formatFileSize(stats.totalSize)}
      </span>
      {selectionStats && (
        <span>
          Selected: {formatCounts(selectionStats.files, selectionStats.folders)} — {formatFileSize(selectionStats.totalSize)}
        </span>
      )}
    </div>
  );
}
