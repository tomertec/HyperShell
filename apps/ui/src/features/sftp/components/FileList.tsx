import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";

import {
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

const ROW_HEIGHT = 22;

function formatCompactDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate || "—";
  }

  const mon = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hr = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${date.getFullYear()}-${mon}-${day} ${hr}:${min}`;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cursorRowRef = useCallback((node: HTMLTableRowElement | null) => {
    node?.scrollIntoView({ block: "nearest" });
  }, []);

  const [dropActive, setDropActive] = useState(false);

  // Resizable column widths
  const defaultColWidths = paneType === "remote"
    ? { size: 50, modified: 120, perms: 42 }
    : { size: 50, modified: 120, perms: 0 };
  const [colWidths, setColWidths] = useState(defaultColWidths);
  const resizingRef = useRef<{ col: "size" | "modified" | "perms"; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((col: "size" | "modified" | "perms", event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = colWidths[col];
    resizingRef.current = { col, startX, startW };

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(30, resizingRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [colWidths]);

  const sortedEntries = useMemo(
    () => sortEntries(entries, sortBy.column, sortBy.direction),
    [entries, sortBy.column, sortBy.direction]
  );

  useEffect(() => {
    const container = containerRef.current;
    const domRows = container?.querySelectorAll("tbody tr") ?? [];
    const firstRow = domRows.item(0) as HTMLTableRowElement | null;
    const firstRowHeight = firstRow?.getBoundingClientRect().height ?? 0;
    const containerHeight = container?.getBoundingClientRect().height ?? 0;

    console.log(
      "[sftp-ui] file list render:",
      `pane=${paneType}`,
      `entries=${entries.length}`,
      `sorted=${sortedEntries.length}`,
      `loading=${isLoading}`,
      `error=${error ?? "(none)"}`,
      `domRows=${domRows.length}`,
      `firstRowH=${firstRowHeight.toFixed(1)}`,
      `containerH=${containerHeight.toFixed(1)}`
    );
  }, [entries.length, error, isLoading, paneType, sortedEntries.length]);

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

  const resizeHandle = (col: "size" | "modified" | "perms") => (
    <span
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent/50"
      onMouseDown={(e) => handleResizeStart(col, e)}
    />
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-sftp-pane={paneType}
      className={`min-h-0 flex-1 overflow-y-auto bg-base-800/70 ${
        dropActive ? "ring-2 ring-inset ring-accent/50" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(event) => onContextMenu(event)}
    >
      {isLoading ? (
        <div className="flex h-32 items-center justify-center px-4 text-sm text-text-muted">
          Loading files...
        </div>
	      ) : (
	        <table className="w-full table-fixed border-collapse text-[12px]" style={{ height: "auto" }}>
          <colgroup>
            <col />
            <col style={{ width: colWidths.size }} />
            <col style={{ width: colWidths.modified }} />
            {paneType === "remote" && <col style={{ width: colWidths.perms }} />}
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/30 bg-base-800 text-[9px] uppercase tracking-wider text-text-muted">
            <tr style={{ height: 20 }}>
              <th
                className="cursor-pointer px-1.5 text-left font-medium"
                onClick={() => handleHeaderClick("name")}
              >
                Name{renderSortIndicator("name")}
              </th>
              <th
                className="relative cursor-pointer px-1.5 text-right font-medium"
                onClick={() => handleHeaderClick("size")}
              >
                Size{renderSortIndicator("size")}
                {resizeHandle("size")}
              </th>
              <th
                className="relative cursor-pointer px-1.5 text-left font-medium"
                onClick={() => handleHeaderClick("modifiedAt")}
              >
                Modified{renderSortIndicator("modifiedAt")}
                {resizeHandle("modified")}
              </th>
              {paneType === "remote" && (
                <th
                  className="relative cursor-pointer px-1.5 text-left font-medium"
                  onClick={() => handleHeaderClick("permissions")}
                >
                  Perms{renderSortIndicator("permissions")}
                  {resizeHandle("perms")}
                </th>
              )}
            </tr>
          </thead>
	          <tbody>
	            {sortedEntries.length === 0 ? (
	              <tr>
	                <td
	                  colSpan={paneType === "remote" ? 4 : 3}
	                  className="px-1.5 py-6 text-center text-[11px] text-text-muted"
	                >
	                  No files or folders
	                </td>
	              </tr>
	            ) : (
	              sortedEntries.map((entry, index) => (
	                <tr
	                  key={entry.path}
	                  ref={cursorIndex === index ? cursorRowRef : undefined}
	                  style={{ height: ROW_HEIGHT }}
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
	                  <td className="overflow-hidden px-1.5">
	                    <div className="flex min-w-0 items-center gap-1" style={{ height: ROW_HEIGHT }}>
	                      <FileIcon name={entry.name} isDirectory={entry.isDirectory} />
	                      <span className={`truncate text-[12px] ${entry.isDirectory ? "font-medium text-text-primary" : "text-text-primary"}`}>
	                        {entry.name}
	                      </span>
	                    </div>
	                  </td>
	                  <td className="overflow-hidden whitespace-nowrap px-1.5 text-right text-[11px] text-text-secondary">
	                    {entry.isDirectory ? "—" : formatFileSize(entry.size)}
	                  </td>
	                  <td className="overflow-hidden whitespace-nowrap px-1.5 text-[11px] text-text-secondary">
	                    {formatCompactDate(entry.modifiedAt)}
	                  </td>
	                  {paneType === "remote" && (
	                    <td className="overflow-hidden whitespace-nowrap px-1.5 font-mono text-[10px] text-text-secondary">
	                      {(entry.permissions ?? 0).toString(8).padStart(4, "0")}
	                    </td>
	                  )}
	                </tr>
	              ))
	            )}
	          </tbody>
	        </table>
	      )}
	    </div>
  );
}
