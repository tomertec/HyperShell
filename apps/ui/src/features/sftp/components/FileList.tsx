import { useCallback, useMemo, useState, type DragEvent, type MouseEvent } from "react";

import {
  formatDate,
  formatFileSize,
  sortEntries,
  type SortColumn,
  type SortDirection
} from "../utils/fileUtils";
import { FileIcon } from "./FileIcon";

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
  cursorIndex: number;
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
  paneType,
  cursorIndex
}: FileListProps) {
  const cursorRowRef = useCallback((node: HTMLTableRowElement | null) => {
    node?.scrollIntoView({ block: "nearest" });
  }, []);

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
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-base-800/70 ${
        dropActive ? "ring-2 ring-inset ring-accent/50" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(event) => onContextMenu(event)}
    >
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-sm text-text-muted">
          Loading files...
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-base-800/95 text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <th
                  className="cursor-pointer px-1.5 py-[3px] text-left font-medium"
                  onClick={() => handleHeaderClick("name")}
                >
                  Name{renderSortIndicator("name")}
                </th>
                <th
                  className="w-20 cursor-pointer px-1.5 py-[3px] text-right font-medium"
                  onClick={() => handleHeaderClick("size")}
                >
                  Size{renderSortIndicator("size")}
                </th>
                <th
                  className="w-36 cursor-pointer px-1.5 py-[3px] text-left font-medium"
                  onClick={() => handleHeaderClick("modifiedAt")}
                >
                  Modified{renderSortIndicator("modifiedAt")}
                </th>
                {paneType === "remote" && (
                  <th
                    className="w-16 cursor-pointer px-1.5 py-[3px] text-left font-medium"
                    onClick={() => handleHeaderClick("permissions")}
                  >
                    Perms{renderSortIndicator("permissions")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, index) => (
                  <tr
                    key={entry.path}
                    ref={cursorIndex === index ? cursorRowRef : undefined}
                    className={`transition-colors ${
                      selection.has(entry.path)
                        ? "bg-accent/15 border-l-2 border-l-accent"
                        : index % 2 === 0
                          ? "hover:bg-base-700/30"
                          : "bg-base-800/20 hover:bg-base-700/30"
                    } ${cursorIndex === index ? "ring-1 ring-inset ring-accent/40" : ""}`}
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
                    <td className="px-1.5 py-[2px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <FileIcon name={entry.name} isDirectory={entry.isDirectory} />
                        <span className={`truncate text-[13px] ${entry.isDirectory ? "font-medium text-text-primary" : "text-text-primary"}`}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-1.5 py-[2px] text-right text-[12px] text-text-secondary">
                      {entry.isDirectory ? "—" : formatFileSize(entry.size)}
                    </td>
                    <td className="px-1.5 py-[2px] text-[12px] text-text-secondary">
                      {formatDate(entry.modifiedAt)}
                    </td>
                    {paneType === "remote" && (
                      <td className="px-1.5 py-[2px] font-mono text-[11px] text-text-secondary">
                        {(entry.permissions ?? 0).toString(8).padStart(4, "0")}
                      </td>
                    )}
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
