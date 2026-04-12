import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type React from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { toast } from "sonner";

import type { FsEntry } from "@hypershell/shared";
import type { SftpStoreState } from "../sftpStore";
import { getParentPath } from "../utils/fileUtils";
import { DriveSelector } from "./DriveSelector";
import { FileContextMenu, type FileContextMenuAction } from "./FileContextMenu";
import { FileList } from "./FileList";
import { PathBreadcrumb, type PathBreadcrumbHandle } from "./PathBreadcrumb";
import { SftpStatusBar } from "./SftpStatusBar";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { PromptDialog } from "../../../components/PromptDialog";

export interface LocalPaneProps {
  store: StoreApi<SftpStoreState>;
  onTransfer: (localPaths: string[], remotePath: string) => void;
  onDownload: (remotePaths: string[], localPath: string) => void;
  isActive: boolean;
  onActivate: () => void;
  breadcrumbRef?: React.RefObject<PathBreadcrumbHandle | null>;
}

interface LocalContextMenuState {
  x: number;
  y: number;
  entry?: FsEntry;
}

function getFileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  return segments[segments.length - 1] || filePath;
}

export function LocalPane({ store, onTransfer, onDownload, isActive, onActivate, breadcrumbRef }: LocalPaneProps) {
  const localPath = useStore(store, (state) => state.localPath);
  const localEntries = useStore(store, (state) => state.localEntries);
  const localSelection = useStore(store, (state) => state.localSelection);
  const localSortBy = useStore(store, (state) => state.localSortBy);
  const localCursorIndex = useStore(store, (state) => state.localCursorIndex);
  const localFilterText = useStore(store, (state) => state.localFilterText);
  const filterCaseSensitive = useStore(store, (state) => state.filterCaseSensitive);
  const filterRegex = useStore(store, (state) => state.filterRegex);
  const isLoading = useStore(store, (state) => state.isLoading.local);
  const error = useStore(store, (state) => state.error.local);

  const setLocalPath = useStore(store, (state) => state.setLocalPath);
  const setLocalEntries = useStore(store, (state) => state.setLocalEntries);
  const setLocalSelection = useStore(store, (state) => state.setLocalSelection);
  const setLocalSortBy = useStore(store, (state) => state.setLocalSortBy);
  const setLoading = useStore(store, (state) => state.setLoading);
  const setError = useStore(store, (state) => state.setError);

  const filteredEntries = useMemo(() => {
    if (!localFilterText) return localEntries;
    if (filterRegex) {
      try {
        const re = new RegExp(localFilterText, filterCaseSensitive ? "" : "i");
        return localEntries.filter((entry) => re.test(entry.name));
      } catch {
        return localEntries;
      }
    }
    if (filterCaseSensitive) {
      return localEntries.filter((entry) => entry.name.includes(localFilterText));
    }
    const lower = localFilterText.toLowerCase();
    return localEntries.filter((entry) => entry.name.toLowerCase().includes(lower));
  }, [localEntries, localFilterText, filterCaseSensitive, filterRegex]);

  useEffect(() => {
    const maxIndex = Math.max(0, filteredEntries.length - 1);
    if (localCursorIndex > maxIndex) {
      store.getState().setCursorIndex("local", maxIndex);
    }
  }, [filteredEntries.length, localCursorIndex, store]);

  const [contextMenu, setContextMenu] = useState<LocalContextMenuState | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; oldName: string }>({
    open: false,
    path: "",
    oldName: "",
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; paths: string[] }>({
    open: false,
    paths: [],
  });

  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path) {
        return;
      }

      setLoading("local", true);
      setError("local", null);

      try {
        const response = await window.hypershell?.fsList?.({ path });
        setLocalEntries(response?.entries ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list local directory";
        if (message.includes("outside the allowed filesystem roots")) {
          try {
            const home = await window.hypershell?.fsGetHome?.();
            if (home?.path && home.path !== path) {
              setLocalPath(home.path);
              setError("local", `Path is outside allowed roots. Returned to ${home.path}.`);
              return;
            }
          } catch {
            // Fall through to the original error if home lookup fails.
          }
        }
        setError("local", message);
      } finally {
        setLoading("local", false);
      }
    },
    [setError, setLoading, setLocalEntries, setLocalPath]
  );

  useEffect(() => {
    if (localPath) {
      return;
    }

    let disposed = false;

    async function loadHome() {
      try {
        const home = await window.hypershell?.fsGetHome?.();
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

  // Internal drop: paths from remote pane's file list → these are remote paths, trigger download
  const handleInternalDrop = useCallback(
    (paths: string[]) => {
      onDownload(paths, localPath);
    },
    [onDownload, localPath]
  );

  // External drop: OS files → no meaningful action for local-to-local
  const handleExternalDrop = useCallback(
    (_localPaths: string[]) => {
      // No action — local-to-local OS drops don't make sense in this context
    },
    []
  );

  const handleRename = useCallback(
    (filePath: string) => {
      const oldName = getFileName(filePath);
      setRenameDialog({ open: true, path: filePath, oldName });
    },
    []
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      const { path: filePath, oldName } = renameDialog;
      setRenameDialog({ open: false, path: "", oldName: "" });

      if (newName === oldName) return;

      const parentPath = getParentPath(filePath);
      const newPath = parentPath.endsWith("\\")
        ? `${parentPath}${newName}`
        : `${parentPath}\\${newName}`;

      try {
        await window.hypershell?.fsRename?.({ oldPath: filePath, newPath });
        await loadDirectory(localPath);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename");
      }
    },
    [renameDialog, loadDirectory, localPath]
  );

  const handleDelete = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      setDeleteDialog({ open: true, paths });
    },
    []
  );

  const handleDeleteConfirm = useCallback(async () => {
    const { paths } = deleteDialog;
    setDeleteDialog({ open: false, paths: [] });

    let failed = 0;
    for (const filePath of paths) {
      try {
        await window.hypershell?.fsTrash?.({ path: filePath });
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      toast.error(`Failed to delete ${failed} item${failed === 1 ? "" : "s"}`);
    }

    await loadDirectory(localPath);
  }, [deleteDialog, loadDirectory, localPath]);

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
      const entry = contextMenu.entry;
      return [
        {
          label: "Open",
          action: () => {
            if (entry.isDirectory) {
              handleNavigate(entry.path);
            } else {
              void window.hypershell?.fsOpenItem?.({ path: entry.path });
            }
          }
        },
        {
          label: "Upload to Remote",
          action: () => onTransfer(selectedPaths, ""),
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: "Rename",
          action: () => handleRename(entry.path)
        },
        {
          label: "Delete",
          action: () => handleDelete(selectedPaths),
          disabled: selectedPaths.length === 0
        },
        { label: "", action: () => {}, separator: true },
        {
          label: "Copy Path",
          action: () => {
            void navigator.clipboard?.writeText(entry.path);
          }
        },
        {
          label: "Show in Explorer",
          action: () => {
            void window.hypershell?.fsShowInFolder?.({ path: entry.path });
          }
        }
      ];
    }

    return [
      { label: "Go Up", action: () => handleNavigate(getParentPath(localPath)) },
      { label: "Refresh", action: () => void loadDirectory(localPath) }
    ];
  }, [contextMenu, handleDelete, handleNavigate, handleRename, loadDirectory, localPath, localSelection, onTransfer]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${isActive ? "border-t-2 border-accent" : "border-t-2 border-transparent"}`}
      onMouseDown={onActivate}
      onContextMenu={(event) => handleContextMenu(event)}
    >
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
        <PathBreadcrumb ref={breadcrumbRef} path={localPath} onNavigate={handleNavigate} separator="\\" editable onPathSubmit={handleNavigate} />
      </div>

      <FileList
        entries={filteredEntries}
        selection={localSelection}
        sortBy={localSortBy}
        isLoading={isLoading}
        error={error}
        onNavigate={handleNavigate}
        onSelect={setLocalSelection}
        onSort={(column, direction) => setLocalSortBy({ column, direction })}
        onInternalDrop={handleInternalDrop}
        onExternalDrop={handleExternalDrop}
        onContextMenu={handleContextMenu}
        paneType="local"
        cursorIndex={localCursorIndex}
      />
      <SftpStatusBar entries={filteredEntries} selection={localSelection} />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}

      <PromptDialog
        open={renameDialog.open}
        title="Rename"
        label="Enter a new name:"
        defaultValue={renameDialog.oldName}
        confirmLabel="Rename"
        onConfirm={handleRenameConfirm}
        onCancel={() => setRenameDialog({ open: false, path: "", oldName: "" })}
      />

      <ConfirmDialog
        open={deleteDialog.open}
        title="Delete"
        message={`Move ${deleteDialog.paths.length} item${deleteDialog.paths.length === 1 ? "" : "s"} to Recycle Bin?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ open: false, paths: [] })}
      />
    </div>
  );
}
