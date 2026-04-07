import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { FsEntry } from "@sshterm/shared";
import type { SftpStoreState } from "../sftpStore";
import { getParentPath } from "../utils/fileUtils";
import { DriveSelector } from "./DriveSelector";
import { FileContextMenu, type FileContextMenuAction } from "./FileContextMenu";
import { FileList } from "./FileList";
import { PathBreadcrumb } from "./PathBreadcrumb";

export interface LocalPaneProps {
  store: StoreApi<SftpStoreState>;
  onTransfer: (localPaths: string[], remotePath: string) => void;
}

interface LocalContextMenuState {
  x: number;
  y: number;
  entry?: FsEntry;
}

export function LocalPane({ store, onTransfer }: LocalPaneProps) {
  const localPath = useStore(store, (state) => state.localPath);
  const localEntries = useStore(store, (state) => state.localEntries);
  const localSelection = useStore(store, (state) => state.localSelection);
  const localSortBy = useStore(store, (state) => state.localSortBy);
  const localCursorIndex = useStore(store, (state) => state.localCursorIndex);
  const isLoading = useStore(store, (state) => state.isLoading.local);
  const error = useStore(store, (state) => state.error.local);

  const setLocalPath = useStore(store, (state) => state.setLocalPath);
  const setLocalEntries = useStore(store, (state) => state.setLocalEntries);
  const setLocalSelection = useStore(store, (state) => state.setLocalSelection);
  const setLocalSortBy = useStore(store, (state) => state.setLocalSortBy);
  const setLoading = useStore(store, (state) => state.setLoading);
  const setError = useStore(store, (state) => state.setError);

  const [contextMenu, setContextMenu] = useState<LocalContextMenuState | null>(null);

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path) {
        return;
      }

      setLoading("local", true);
      setError("local", null);

      try {
        const response = await window.sshterm?.fsList?.({ path });
        setLocalEntries(response?.entries ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list local directory";
        setError("local", message);
      } finally {
        setLoading("local", false);
      }
    },
    [setError, setLoading, setLocalEntries]
  );

  useEffect(() => {
    if (localPath) {
      return;
    }

    let disposed = false;

    async function loadHome() {
      try {
        const home = await window.sshterm?.fsGetHome?.();
        if (disposed) {
          return;
        }

        if (home?.path) {
          setLocalPath(home.path);
        }
      } catch {
        if (!disposed) {
          setError("local", "Failed to resolve local home directory");
        }
      }
    }

    void loadHome();

    return () => {
      disposed = true;
    };
  }, [localPath, setError, setLocalPath]);

  useEffect(() => {
    if (!localPath) {
      return;
    }

    void loadDirectory(localPath);
  }, [loadDirectory, localPath]);

  const handleNavigate = useCallback(
    (path: string) => {
      setLocalPath(path);
      setLocalSelection(new Set<string>());
    },
    [setLocalPath, setLocalSelection]
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent, entry?: FsEntry) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, entry });
    },
    []
  );

  const contextActions = useMemo<FileContextMenuAction[]>(() => {
    if (!contextMenu) {
      return [];
    }

    const selectedPaths =
      localSelection.size > 0
        ? Array.from(localSelection)
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
          label: "Upload to Remote",
          action: () => onTransfer(selectedPaths, ""),
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: "Copy Path",
          action: () => {
            void navigator.clipboard?.writeText(contextMenu.entry!.path);
          }
        }
      ];
    }

    return [
      { label: "Go Up", action: () => handleNavigate(getParentPath(localPath)) },
      { label: "Refresh", action: () => void loadDirectory(localPath) }
    ];
  }, [contextMenu, handleNavigate, loadDirectory, localPath, localSelection, onTransfer]);

  return (
    <div className="flex h-full flex-col" onContextMenu={(event) => handleContextMenu(event)}>
      <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
        <DriveSelector currentPath={localPath} onSelect={handleNavigate} />
        <button
          type="button"
          title="Go up"
          className="rounded p-0.5 text-[11px] text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
          onClick={() => handleNavigate(getParentPath(localPath))}
        >
          ..
        </button>
        <div className="mx-0.5 h-3 w-px bg-base-700" />
        <PathBreadcrumb path={localPath} onNavigate={handleNavigate} separator="\\" />
      </div>

      <FileList
        entries={localEntries}
        selection={localSelection}
        sortBy={localSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setLocalSelection}
        onSort={(column, direction) => setLocalSortBy({ column, direction })}
        onDrop={() => {}}
        onContextMenu={handleContextMenu}
        paneType="local"
        cursorIndex={localCursorIndex}
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
