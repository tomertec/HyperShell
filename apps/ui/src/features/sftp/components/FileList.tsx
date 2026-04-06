import { useMemo, useState, type DragEvent, type MouseEvent } from "react";

import {
  formatDate,
  formatFileSize,
  getFileIcon,
  sortEntries,
  type SortColumn,
  type SortDirection
} from "../utils/fileUtils";

export interface FileListEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions?: number;
}

export interface FileListSortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface FileListProps {
  entries: FileListEntry[];
  selection: Set<string>;
  sortBy: FileListSortState;
  isLoading: boolean;
  error: string | null;
  onNavigate: (path: string) => void;
  onSelect: (selection: Set<string>) => void;
  onSort: (column: SortColumn, direction: SortDirection) => void;
  onDrop: (files: string[], targetPath: string) => void;
  onContextMenu: (event: MouseEvent, entry?: FileListEntry) => void;
  onEdit?: (path: string) => void;
  paneType: "local" | "remote";
}

function getIconBadge(iconKey: string): string {
  if (iconKey === "folder") {
    return "DIR";
  }

  if (iconKey.startsWith("file-")) {
    return iconKey.slice(5, 8).toUpperCase();
  }

  return "FILE";
}

export function FileList({
  entries,
  selection,
  sortBy,
  isLoading,
  error,
  onNavigate,
  onSelect,
  onSort,
  onDrop,
  onContextMenu,
  onEdit,
  paneType
}: FileListProps) {
  const [dropActive, setDropActive] = useState(false);

  const sortedEntries = useMemo(
    () => sortEntries(entries, sortBy.column, sortBy.direction),
    [entries, sortBy.column, sortBy.direction]
  );

  const handleHeaderClick = (column: SortColumn) => {
    const direction =
      sortBy.column === column && sortBy.direction === "asc" ? "desc" : "asc";
    onSort(column, direction);
  };

  const handleRowClick = (entry: FileListEntry, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      const next = new Set(selection);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
      }
      onSelect(next);
      return;
    }

    if (event.shiftKey && selection.size > 0) {
      const paths = sortedEntries.map((item) => item.path);
      const selectedPaths = Array.from(selection);
      const lastSelected = selectedPaths[selectedPaths.length - 1];
      const startIndex = Math.max(paths.indexOf(lastSelected), 0);
      const endIndex = Math.max(paths.indexOf(entry.path), 0);
      const [from, to] =
        startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      onSelect(new Set(paths.slice(from, to + 1)));
      return;
    }

    onSelect(new Set([entry.path]));
  };

  const handleRowDoubleClick = (entry: FileListEntry) => {
    if (entry.isDirectory) {
      onNavigate(entry.path);
      return;
    }

    onEdit?.(entry.path);
  };

  const handleDragStart = (event: DragEvent<HTMLTableRowElement>, entry: FileListEntry) => {
    const paths = selection.has(entry.path) ? Array.from(selection) : [entry.path];
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-sftp-paths", JSON.stringify(paths));
    event.dataTransfer.setData("text/plain", paths.join("\n"));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(true);
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = () => {
    setDropActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);

    const internalPaths = event.dataTransfer.getData("application/x-sftp-paths");
    if (internalPaths) {
      onDrop(JSON.parse(internalPaths) as string[], "");
      return;
    }

    const files = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (files.length > 0) {
      onDrop(files, "");
    }
  };

  const renderSortIndicator = (column: SortColumn) => {
    if (sortBy.column !== column) {
      return null;
    }

    return sortBy.direction === "asc" ? " ▲" : " ▼";
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-base-800/70 ${
        dropActive ? "ring-2 ring-inset ring-accent/50" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(event) => onContextMenu(event)}
    >
      <div className="border-b border-border/70 bg-base-900/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {paneType === "remote" ? "Remote Files" : "Local Files"}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-sm text-text-muted">
          Loading files...
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-base-800/95 text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium"
                  onClick={() => handleHeaderClick("name")}
                >
                  Name{renderSortIndicator("name")}
                </th>
                <th
                  className="w-28 cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => handleHeaderClick("size")}
                >
                  Size{renderSortIndicator("size")}
                </th>
                <th
                  className="w-44 cursor-pointer px-3 py-2 text-left font-medium"
                  onClick={() => handleHeaderClick("modifiedAt")}
                >
                  Modified{renderSortIndicator("modifiedAt")}
                </th>
                {paneType === "remote" && (
                  <th
                    className="w-24 cursor-pointer px-3 py-2 text-left font-medium"
                    onClick={() => handleHeaderClick("permissions")}
                  >
                    Perms{renderSortIndicator("permissions")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry) => {
                const iconKey = getFileIcon(entry.name, entry.isDirectory);

                return (
                  <tr
                    key={entry.path}
                    className={`border-t border-border/50 transition-colors ${
                      selection.has(entry.path)
                        ? "bg-accent/10"
                        : "hover:bg-base-700/50"
                    }`}
                    onClick={(event) => handleRowClick(entry, event)}
                    onDoubleClick={() => handleRowDoubleClick(entry)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!selection.has(entry.path)) {
                        onSelect(new Set([entry.path]));
                      }
                      onContextMenu(event, entry);
                    }}
                    draggable
                    onDragStart={(event) => handleDragStart(event, entry)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-flex h-5 min-w-10 items-center justify-center rounded bg-base-700/80 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                          title={iconKey}
                        >
                          {getIconBadge(iconKey)}
                        </span>
                        <span className="truncate text-text-primary">{entry.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {entry.isDirectory ? "—" : formatFileSize(entry.size)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {formatDate(entry.modifiedAt)}
                    </td>
                    {paneType === "remote" && (
                      <td className="px-3 py-2 font-mono text-text-secondary">
                        {(entry.permissions ?? 0).toString(8).padStart(4, "0")}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
