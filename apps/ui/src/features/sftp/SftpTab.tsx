import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { SftpEntry, TransferJob } from "@sshterm/shared";
import { getSftpStore, disposeSftpStore } from "./sftpStore";
import { transferStore } from "./transferStore";
import { getParentPath, joinRemotePath } from "./utils/fileUtils";
import { SftpDualPane } from "./components/SftpDualPane";
import { SftpToolbar } from "./components/SftpToolbar";
import { TransferPanel } from "./components/TransferPanel";
import { SyncPanel } from "./components/SyncPanel";
import { SftpPropertiesDialog } from "./components/SftpPropertiesDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";

export interface SftpTabProps {
  sftpSessionId: string;
  hostId: string;
  onClose: () => void;
}

function joinLocalPath(base: string, name: string): string {
  const normalizedBase = base.replace(/[\\/]+$/, "");
  if (!normalizedBase) {
    return name;
  }

  const useWindowsSeparator =
    normalizedBase.includes("\\") || /^[a-zA-Z]:/.test(normalizedBase);

  return `${normalizedBase}${useWindowsSeparator ? "\\" : "/"}${name}`;
}

function mergeTransfers(existing: TransferJob[], next: TransferJob[]): TransferJob[] {
  const byId = new Map(existing.map((transfer) => [transfer.transferId, transfer]));
  for (const transfer of next) {
    byId.set(transfer.transferId, transfer);
  }
  return [...byId.values()];
}

function extractSftpEntries(response: unknown): SftpEntry[] {
  if (Array.isArray(response)) {
    return response as SftpEntry[];
  }

  if (!response || typeof response !== "object") {
    return [];
  }

  const payload = response as Record<string, unknown>;
  if (Array.isArray(payload.entries)) {
    return payload.entries as SftpEntry[];
  }

  if (Array.isArray(payload.items)) {
    return payload.items as SftpEntry[];
  }

  return [];
}

export function SftpTab({ sftpSessionId, hostId, onClose }: SftpTabProps) {
  const store = useMemo(() => getSftpStore(sftpSessionId), [sftpSessionId]);
  const propertiesRequestIdRef = useRef(0);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const remotePath = useStore(store, (state) => state.remotePath);
  const activePane = useStore(store, (state) => state.activePane);
  const localFilterText = useStore(store, (state) => state.localFilterText);
  const remoteFilterText = useStore(store, (state) => state.remoteFilterText);
  const localEntries = useStore(store, (state) => state.localEntries);
  const remoteEntries = useStore(store, (state) => state.remoteEntries);
  const setFilterText = useStore(store, (state) => state.setFilterText);

  const filterText = activePane === "local" ? localFilterText : remoteFilterText;
  const activeEntries = activePane === "local" ? localEntries : remoteEntries;
  const filterTotalCount = activeEntries.length;
  const filterMatchCount = filterText
    ? activeEntries.filter((e) => e.name.toLowerCase().includes(filterText.toLowerCase())).length
    : filterTotalCount;

  // Dialog state for rename
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; oldName: string }>({
    open: false,
    path: "",
    oldName: "",
  });

  // Dialog state for delete confirmation
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; paths: string[] }>({
    open: false,
    paths: [],
  });

  // Dialog state for mkdir
  const [mkdirDialog, setMkdirDialog] = useState(false);

  // Dialog state for bookmark
  const [bookmarkDialog, setBookmarkDialog] = useState<{ open: boolean; path: string; defaultName: string }>({
    open: false,
    path: "",
    defaultName: "",
  });

  // Dialog state for properties
  const [propertiesDialog, setPropertiesDialog] = useState<{
    open: boolean;
    path: string;
    entry: SftpEntry | null;
    isLoading: boolean;
    error: string | null;
  }>({
    open: false,
    path: "",
    entry: null,
    isLoading: false,
    error: null
  });

  const refreshTransfers = useCallback(async () => {
    try {
      const response = await window.sshterm?.sftpTransferList?.();
      if (!response) {
        return;
      }

      transferStore.getState().setTransfers(response.transfers);
    } catch {
      // Ignore polling errors for now.
    }
  }, []);

  const refreshRemoteDirectory = useCallback(async () => {
    const sftpList = window.sshterm?.sftpList;
    if (!sftpList) {
      throw new Error("SFTP list API is unavailable in preload bridge");
    }
    const response = await sftpList({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(extractSftpEntries(response));
  }, [remotePath, sftpSessionId, store]);

  useEffect(() => {
    const unsubscribe = window.sshterm?.onSftpEvent?.((event) => {
      if (event.kind === "transfer-progress") {
        transferStore.getState().updateTransfer(event.transferId, {
          bytesTransferred: event.bytesTransferred,
          totalBytes: event.totalBytes,
          speed: event.speed,
          status: event.status
        });
      }

      if (event.kind === "transfer-complete") {
        transferStore.getState().updateTransfer(event.transferId, {
          status: event.status,
          error: event.error
        });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    void refreshTransfers();
  }, [refreshTransfers]);

  useEffect(() => {
    return () => {
      disposeSftpStore(sftpSessionId);
    };
  }, [sftpSessionId]);

  const handleUpload = useCallback(
    async (localPaths: string[], remoteTargetPath: string) => {
      if (localPaths.length === 0) {
        return;
      }

      const targetPath = remoteTargetPath || store.getState().remotePath;

      const operations = await Promise.all(
        localPaths.map(async (localPath) => {
          let isDirectory = false;

          try {
            const stat = await window.sshterm?.fsStat?.({ path: localPath });
            isDirectory = Boolean(stat?.isDirectory);
          } catch {
            isDirectory = false;
          }

          const fileName = localPath.split(/[/\\]/).pop() ?? localPath;

          return {
            type: "upload" as const,
            localPath,
            remotePath: joinRemotePath(targetPath, fileName),
            isDirectory
          };
        })
      );

      const created =
        (await window.sshterm?.sftpTransferStart?.({
          sftpSessionId,
          operations
        })) ?? [];

      const current = transferStore.getState().transfers;
      transferStore.getState().setTransfers(mergeTransfers(current, created));
      void refreshTransfers();
    },
    [refreshTransfers, sftpSessionId, store]
  );

  const handleDownload = useCallback(
    async (remotePaths: string[], localTargetPath: string) => {
      if (remotePaths.length === 0) {
        return;
      }

      const localPath = localTargetPath || store.getState().localPath;
      if (!localPath) {
        return;
      }

      const entriesByPath = new Map(
        store.getState().remoteEntries.map((entry) => [entry.path, entry])
      );

      const operations = await Promise.all(
        remotePaths.map(async (remoteFilePath) => {
          let isDirectory = entriesByPath.get(remoteFilePath)?.isDirectory ?? false;
          if (!entriesByPath.has(remoteFilePath)) {
            try {
              const stat = await window.sshterm?.sftpStat?.({
                sftpSessionId,
                path: remoteFilePath
              });
              isDirectory = Boolean(stat?.isDirectory);
            } catch {
              isDirectory = false;
            }
          }

          const fileName = remoteFilePath.split("/").pop() ?? remoteFilePath;

          return {
            type: "download" as const,
            localPath: joinLocalPath(localPath, fileName),
            remotePath: remoteFilePath,
            isDirectory
          };
        })
      );

      const created =
        (await window.sshterm?.sftpTransferStart?.({
          sftpSessionId,
          operations
        })) ?? [];

      const current = transferStore.getState().transfers;
      transferStore.getState().setTransfers(mergeTransfers(current, created));
      void refreshTransfers();
    },
    [refreshTransfers, sftpSessionId, store]
  );

  const handleRename = useCallback(
    (path: string) => {
      const oldName = path.split("/").pop() ?? "";
      setRenameDialog({ open: true, path, oldName });
    },
    []
  );

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      const { path, oldName } = renameDialog;
      setRenameDialog({ open: false, path: "", oldName: "" });

      if (newName === oldName) return;

      const parentPath = getParentPath(path);
      const newPath = joinRemotePath(parentPath, newName);

      await window.sshterm?.sftpRename?.({
        sftpSessionId,
        oldPath: path,
        newPath
      });

      await refreshRemoteDirectory();
    },
    [renameDialog, refreshRemoteDirectory, sftpSessionId]
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

    await Promise.all(
      paths.map((path) =>
        window.sshterm?.sftpDelete?.({ sftpSessionId, path, recursive: true })
      )
    );

    await refreshRemoteDirectory();
  }, [deleteDialog, refreshRemoteDirectory, sftpSessionId]);

  const handleMkdir = useCallback(() => {
    setMkdirDialog(true);
  }, []);

  const handleMkdirConfirm = useCallback(
    async (name: string) => {
      setMkdirDialog(false);

      const nextPath = joinRemotePath(remotePath, name);
      await window.sshterm?.sftpMkdir?.({
        sftpSessionId,
        path: nextPath
      });

      await refreshRemoteDirectory();
    },
    [refreshRemoteDirectory, remotePath, sftpSessionId]
  );

  const handleBookmark = useCallback(
    (path: string) => {
      if (!hostId) return;
      const defaultName = path.split("/").pop() || path;
      setBookmarkDialog({ open: true, path, defaultName });
    },
    [hostId]
  );

  const handleBookmarkConfirm = useCallback(
    async (name: string) => {
      const { path } = bookmarkDialog;
      setBookmarkDialog({ open: false, path: "", defaultName: "" });

      await window.sshterm?.sftpBookmarksUpsert?.({
        hostId,
        name,
        remotePath: path
      });
    },
    [bookmarkDialog, hostId]
  );

  const closePropertiesDialog = useCallback(() => {
    propertiesRequestIdRef.current += 1;
    setPropertiesDialog({
      open: false,
      path: "",
      entry: null,
      isLoading: false,
      error: null
    });
  }, []);

  const handleProperties = useCallback(
    async (path: string) => {
      const requestId = propertiesRequestIdRef.current + 1;
      propertiesRequestIdRef.current = requestId;

      setPropertiesDialog({
        open: true,
        path,
        entry: null,
        isLoading: true,
        error: null
      });

      try {
        const sftpStat = window.sshterm?.sftpStat;
        if (!sftpStat) {
          throw new Error("SFTP stat API is unavailable in preload bridge");
        }

        const entry = await sftpStat({ sftpSessionId, path });
        if (!entry) {
          throw new Error("File details are unavailable");
        }
        if (propertiesRequestIdRef.current !== requestId) {
          return;
        }

        setPropertiesDialog({
          open: true,
          path,
          entry,
          isLoading: false,
          error: null
        });
      } catch (statError) {
        if (propertiesRequestIdRef.current !== requestId) {
          return;
        }

        const message =
          statError instanceof Error ? statError.message : "Failed to load file details";
        setPropertiesDialog({
          open: true,
          path,
          entry: null,
          isLoading: false,
          error: message
        });
      }
    },
    [sftpSessionId]
  );

  const handleApplyPermissions = useCallback(
    async (permissions: number) => {
      const path = propertiesDialog.path;
      if (!path) {
        throw new Error("No file selected");
      }

      const sftpChmod = window.sshterm?.sftpChmod;
      const sftpStat = window.sshterm?.sftpStat;
      if (!sftpChmod || !sftpStat) {
        throw new Error("SFTP chmod/stat APIs are unavailable in preload bridge");
      }

      await sftpChmod({
        sftpSessionId,
        path,
        permissions
      });

      const refreshed = await sftpStat({ sftpSessionId, path });
      if (!refreshed) {
        throw new Error("Failed to refresh file details after permission update");
      }

      setPropertiesDialog((previous) => {
        if (!previous.open || previous.path !== path) {
          return previous;
        }

        return {
          ...previous,
          entry: refreshed,
          error: null
        };
      });

      await refreshRemoteDirectory();
    },
    [propertiesDialog.path, refreshRemoteDirectory, sftpSessionId]
  );

  const handleFilterChange = useCallback(
    (text: string) => {
      setFilterText(activePane, text);
    },
    [activePane, setFilterText]
  );

  const handleRefresh = useCallback(async () => {
    const state = store.getState();
    if (state.activePane === "remote") {
      await refreshRemoteDirectory();
    } else {
      const currentLocalPath = state.localPath;
      if (currentLocalPath) {
        try {
          const response = await window.sshterm?.fsList?.({ path: currentLocalPath });
          store.getState().setLocalEntries(response?.entries ?? []);
        } catch {
          // ignore
        }
      }
    }
  }, [refreshRemoteDirectory, store]);

  const handleDisconnect = useCallback(async () => {
    await window.sshterm?.sftpDisconnect?.({ sftpSessionId });
    onClose();
  }, [onClose, sftpSessionId]);

  return (
    <div className="relative flex h-full flex-col">
      <SftpToolbar
        store={store}
        hostId={hostId}
        onDisconnect={handleDisconnect}
        filterText={filterText}
        onFilterChange={handleFilterChange}
        filterMatchCount={filterMatchCount}
        filterTotalCount={filterTotalCount}
        filterInputRef={filterInputRef}
        onToggleSync={() => setShowSyncPanel((v) => !v)}
        syncActive={showSyncPanel}
      />

      <SftpDualPane
        store={store}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onEdit={(remotePath: string) => {
          void window.sshterm?.editorOpen?.({ sftpSessionId, remotePath });
        }}
        onProperties={handleProperties}
        onRename={handleRename}
        onDelete={handleDelete}
        onMkdir={handleMkdir}
        onBookmark={handleBookmark}
        onRefresh={handleRefresh}
        filterInputRef={filterInputRef}
      />

      {showSyncPanel && (
        <SyncPanel
          sftpSessionId={sftpSessionId}
          localPath={store.getState().localPath}
          remotePath={remotePath}
          onClose={() => setShowSyncPanel(false)}
        />
      )}

      <TransferPanel />

      <SftpPropertiesDialog
        open={propertiesDialog.open}
        path={propertiesDialog.path}
        entry={propertiesDialog.entry}
        isLoading={propertiesDialog.isLoading}
        error={propertiesDialog.error}
        onApplyPermissions={handleApplyPermissions}
        onClose={closePropertiesDialog}
      />

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
        message={`Delete ${deleteDialog.paths.length} item(s)? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialog({ open: false, paths: [] })}
      />

      <PromptDialog
        open={mkdirDialog}
        title="New Folder"
        label="Folder name:"
        placeholder="my-folder"
        confirmLabel="Create"
        onConfirm={handleMkdirConfirm}
        onCancel={() => setMkdirDialog(false)}
      />

      <PromptDialog
        open={bookmarkDialog.open}
        title="Bookmark"
        label="Bookmark name:"
        defaultValue={bookmarkDialog.defaultName}
        confirmLabel="Save"
        onConfirm={handleBookmarkConfirm}
        onCancel={() => setBookmarkDialog({ open: false, path: "", defaultName: "" })}
      />
    </div>
  );
}
