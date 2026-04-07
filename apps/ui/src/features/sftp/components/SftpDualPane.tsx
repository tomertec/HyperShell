import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpStoreState } from "../sftpStore";
import { handleFileKeyDown, type FileKeyboardContext } from "../hooks/useFileKeyboard";
import { getParentPath, sortEntries } from "../utils/fileUtils";
import { LocalPane } from "./LocalPane";
import { RemotePane } from "./RemotePane";

export interface SftpDualPaneProps {
  store: StoreApi<SftpStoreState>;
  onUpload: (localPaths: string[], remotePath: string) => void;
  onDownload: (remotePaths: string[], localPath: string) => void;
  onEdit: (remotePath: string) => void;
  onRename: (remotePath: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onBookmark: (path: string) => void;
  onRefresh: () => void;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
}

export function SftpDualPane({
  store,
  onUpload,
  onDownload,
  onEdit,
  onRename,
  onDelete,
  onMkdir,
  onBookmark,
  onRefresh,
  filterInputRef
}: SftpDualPaneProps) {
  const activePane = useStore(store, (state) => state.activePane);
  const setActivePane = useStore(store, (state) => state.setActivePane);
  const localEntries = useStore(store, (state) => state.localEntries);
  const remoteEntries = useStore(store, (state) => state.remoteEntries);
  const localSelection = useStore(store, (state) => state.localSelection);
  const remoteSelection = useStore(store, (state) => state.remoteSelection);
  const localCursorIndex = useStore(store, (state) => state.localCursorIndex);
  const remoteCursorIndex = useStore(store, (state) => state.remoteCursorIndex);
  const localSortBy = useStore(store, (state) => state.localSortBy);
  const remoteSortBy = useStore(store, (state) => state.remoteSortBy);
  const localPath = useStore(store, (state) => state.localPath);
  const remotePath = useStore(store, (state) => state.remotePath);
  const localFilterText = useStore(store, (state) => state.localFilterText);
  const remoteFilterText = useStore(store, (state) => state.remoteFilterText);
  const setCursorIndex = useStore(store, (state) => state.setCursorIndex);
  const setLocalSelection = useStore(store, (state) => state.setLocalSelection);
  const setRemoteSelection = useStore(store, (state) => state.setRemoteSelection);
  const setLocalPath = useStore(store, (state) => state.setLocalPath);
  const setRemotePath = useStore(store, (state) => state.setRemotePath);

  const [splitRatio, setSplitRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const activeSortBy = activePane === "local" ? localSortBy : remoteSortBy;
  const activeFilterText = activePane === "local" ? localFilterText : remoteFilterText;
  const rawEntries = activePane === "local" ? localEntries : remoteEntries;
  const sortedEntries = useMemo(
    () => sortEntries(rawEntries, activeSortBy.column, activeSortBy.direction),
    [rawEntries, activeSortBy.column, activeSortBy.direction]
  );
  const filteredEntries = useMemo(() => {
    if (!activeFilterText) return sortedEntries;
    const lower = activeFilterText.toLowerCase();
    return sortedEntries.filter((e) => e.name.toLowerCase().includes(lower));
  }, [sortedEntries, activeFilterText]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const ctx: FileKeyboardContext = {
        entries: filteredEntries,
        cursorIndex: activePane === "local" ? localCursorIndex : remoteCursorIndex,
        selection: activePane === "local" ? localSelection : remoteSelection,
        setCursorIndex: (index) => setCursorIndex(activePane, index),
        setSelection: (sel) =>
          activePane === "local" ? setLocalSelection(sel) : setRemoteSelection(sel),
        onNavigate: (path) =>
          activePane === "local" ? setLocalPath(path) : setRemotePath(path),
        onGoUp: () => {
          const currentPath = activePane === "local" ? localPath : remotePath;
          const parent = getParentPath(currentPath);
          if (activePane === "local") {
            setLocalPath(parent);
          } else {
            setRemotePath(parent);
          }
        },
        onEdit: onEdit,
        onRename: onRename,
        onDelete: onDelete,
        onMkdir: onMkdir,
        onTransfer: (paths) => {
          if (activePane === "local") {
            onUpload(paths, "");
          } else {
            onDownload(paths, "");
          }
        },
        onRefresh: onRefresh,
        onFocusFilter: () => filterInputRef.current?.focus(),
        onFocusBreadcrumb: () => {
          // TODO: wire breadcrumb editing trigger
        },
        onSwitchPane: () => setActivePane(activePane === "local" ? "remote" : "local"),
        onSelectAll: () => {
          const allPaths = new Set(filteredEntries.map((e) => e.path));
          if (activePane === "local") {
            setLocalSelection(allPaths);
          } else {
            setRemoteSelection(allPaths);
          }
        }
      };

      const handled = handleFileKeyDown(event.nativeEvent, ctx);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [
      activePane,
      filteredEntries,
      localCursorIndex,
      remoteCursorIndex,
      localSelection,
      remoteSelection,
      localPath,
      remotePath,
      setCursorIndex,
      setActivePane,
      setLocalSelection,
      setRemoteSelection,
      setLocalPath,
      setRemotePath,
      onEdit,
      onRename,
      onDelete,
      onMkdir,
      onUpload,
      onDownload,
      onRefresh,
      filterInputRef
    ]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleMouseDown = useCallback(() => {
    draggingRef.current = true;

    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const nextRatio = (event.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(0.8, Math.max(0.2, nextRatio)));
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 overflow-hidden outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{ width: `${splitRatio * 100}%` }}
        className="flex min-h-0 min-w-[260px] flex-col border-r border-base-700"
      >
        <LocalPane store={store} onTransfer={onUpload} isActive={activePane === "local"} onActivate={() => setActivePane("local")} />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        className="w-1 cursor-col-resize bg-base-700 transition-colors hover:bg-accent"
        onMouseDown={handleMouseDown}
      />

      <div
        style={{ width: `${(1 - splitRatio) * 100}%` }}
        className="flex min-h-0 min-w-[260px] flex-col"
      >
        <RemotePane
          store={store}
          onTransfer={onDownload}
          onEdit={onEdit}
          onRename={onRename}
          onDelete={onDelete}
          onMkdir={onMkdir}
          onBookmark={onBookmark}
          isActive={activePane === "remote"}
          onActivate={() => setActivePane("remote")}
        />
      </div>
    </div>
  );
}
