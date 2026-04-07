import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpStoreState } from "../sftpStore";
import { getParentPath } from "../utils/fileUtils";
import { FileContextMenu, type FileContextMenuAction } from "./FileContextMenu";
import { FileList, type FileListEntry } from "./FileList";
import { PathBreadcrumb } from "./PathBreadcrumb";

export interface RemotePaneProps {
  store: StoreApi<SftpStoreState>;
  onTransfer: (remotePaths: string[], localPath: string) => void;
  onEdit: (remotePath: string) => void;
  onRename: (remotePath: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onBookmark: (remotePath: string) => void;
  isActive: boolean;
  onActivate: () => void;
}

interface RemoteContextMenuState {
  x: number;
  y: number;
  entry?: FileListEntry;
}

export function RemotePane({
  store,
  onTransfer,
  onEdit,
  onRename,
  onDelete,
  onMkdir,
  onBookmark,
  isActive,
  onActivate
}: RemotePaneProps) {
  const sftpSessionId = useStore(store, (state) => state.sftpSessionId);
  const remotePath = useStore(store, (state) => state.remotePath);
  const remoteEntries = useStore(store, (state) => state.remoteEntries);
  const remoteSelection = useStore(store, (state) => state.remoteSelection);
  const remoteSortBy = useStore(store, (state) => state.remoteSortBy);
  const remoteCursorIndex = useStore(store, (state) => state.remoteCursorIndex);
  const remoteFilterText = useStore(store, (state) => state.remoteFilterText);
  const isLoading = useStore(store, (state) => state.isLoading.remote);
  const error = useStore(store, (state) => state.error.remote);

  const setRemotePath = useStore(store, (state) => state.setRemotePath);
  const setRemoteEntries = useStore(store, (state) => state.setRemoteEntries);
  const setRemoteSelection = useStore(store, (state) => state.setRemoteSelection);
  const setRemoteSortBy = useStore(store, (state) => state.setRemoteSortBy);
  const setLoading = useStore(store, (state) => state.setLoading);
  const setError = useStore(store, (state) => state.setError);

  const filteredEntries = useMemo(() => {
    if (!remoteFilterText) return remoteEntries;
    const lower = remoteFilterText.toLowerCase();
    return remoteEntries.filter((entry) => entry.name.toLowerCase().includes(lower));
  }, [remoteEntries, remoteFilterText]);

  useEffect(() => {
    const maxIndex = Math.max(0, filteredEntries.length - 1);
    if (remoteCursorIndex > maxIndex) {
      store.getState().setCursorIndex("remote", maxIndex);
    }
  }, [filteredEntries.length, remoteCursorIndex, store]);

  const [contextMenu, setContextMenu] = useState<RemoteContextMenuState | null>(null);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!sftpSessionId) {
        return;
      }

      setLoading("remote", true);
      setError("remote", null);

      try {
        const response = await window.sshterm?.sftpList?.({ sftpSessionId, path });
        setRemoteEntries(response?.entries ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list remote directory";
        setError("remote", message);
      } finally {
        setLoading("remote", false);
      }
    },
    [setError, setLoading, setRemoteEntries, sftpSessionId]
  );

  useEffect(() => {
    if (!remotePath) {
      return;
    }

    void loadDirectory(remotePath);
  }, [loadDirectory, remotePath]);

  const handleNavigate = useCallback(
    (path: string) => {
      setRemotePath(path);
      setRemoteSelection(new Set<string>());
    },
    [setRemotePath, setRemoteSelection]
  );

  const handleDrop = useCallback(
    (paths: string[]) => {
      onTransfer(paths, "");
    },
    [onTransfer]
  );

  const handleContextMenu = useCallback((event: ReactMouseEvent, entry?: FileListEntry) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const contextActions = useMemo<FileContextMenuAction[]>(() => {
    if (!contextMenu) {
      return [];
    }

    const selectedPaths =
      remoteSelection.size > 0
        ? Array.from(remoteSelection)
        : contextMenu.entry
          ? [contextMenu.entry.path]
          : [];

    if (contextMenu.entry) {
      return [
        {
          label: "Open",
          action: () => handleNavigate(contextMenu.entry!.path),
          disabled: !contextMenu.entry.isDirectory
        },
        {
          label: "Edit",
          action: () => onEdit(contextMenu.entry!.path),
          disabled: contextMenu.entry.isDirectory
        },
        {
          label: "Download",
          action: () => onTransfer(selectedPaths, ""),
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        { label: "Rename", action: () => onRename(contextMenu.entry!.path) },
        {
          label: "Delete",
          action: () => onDelete(selectedPaths),
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: "Copy Path",
          action: () => {
            void navigator.clipboard?.writeText(contextMenu.entry!.path);
          }
        },
        {
          label: "Bookmark This Folder",
          action: () =>
            onBookmark(
              contextMenu.entry!.isDirectory
                ? contextMenu.entry!.path
                : getParentPath(contextMenu.entry!.path)
            )
        }
      ];
    }

    return [
      { label: "Go Up", action: () => handleNavigate(getParentPath(remotePath)) },
      { label: "New Folder", action: onMkdir },
      { label: "Refresh", action: () => void loadDirectory(remotePath) },
      { label: "", action: () => {}, separator: true },
      { label: "Bookmark This Folder", action: () => onBookmark(remotePath) }
    ];
  }, [
    contextMenu,
    handleNavigate,
    loadDirectory,
    onBookmark,
    onDelete,
    onEdit,
    onMkdir,
    onRename,
    onTransfer,
    remotePath,
    remoteSelection
  ]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${isActive ? "border-t-2 border-accent" : "border-t-2 border-transparent"}`}
      onMouseDown={onActivate}
      onContextMenu={(event) => handleContextMenu(event)}
    >
      <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Remote</span>
        <button
          type="button"
          title="Go up"
          className="rounded p-0.5 text-[11px] text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
          onClick={() => handleNavigate(getParentPath(remotePath))}
        >
          ..
        </button>
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <PathBreadcrumb path={remotePath} onNavigate={handleNavigate} editable onPathSubmit={handleNavigate} />
      </div>

      <FileList
        entries={filteredEntries}
        selection={remoteSelection}
        sortBy={remoteSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setRemoteSelection}
        onSort={(column, direction) => setRemoteSortBy({ column, direction })}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onEdit={onEdit}
        paneType="remote"
        cursorIndex={remoteCursorIndex}
      />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
