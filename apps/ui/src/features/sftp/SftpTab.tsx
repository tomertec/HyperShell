import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { TransferJob } from "@sshterm/shared";
import { getSftpStore, disposeSftpStore } from "./sftpStore";
import { transferStore } from "./transferStore";
import { getParentPath, joinRemotePath } from "./utils/fileUtils";
import { SftpDualPane } from "./components/SftpDualPane";
import { RemoteEditor } from "./components/RemoteEditor";
import { SftpToolbar } from "./components/SftpToolbar";
import { TransferPanel } from "./components/TransferPanel";

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

export function SftpTab({ sftpSessionId, hostId, onClose }: SftpTabProps) {
  const store = useMemo(() => getSftpStore(sftpSessionId), [sftpSessionId]);
  const [editingFile, setEditingFile] = useState<string | null>(null);
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
    const response = await window.sshterm?.sftpList?.({ sftpSessionId, path: remotePath });
    store.getState().setRemoteEntries(response?.entries ?? []);
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
    async (path: string) => {
      const oldName = path.split("/").pop() ?? "";
      const newName = window.prompt("Rename to:", oldName);
      if (!newName || newName === oldName) {
        return;
      }

      const parentPath = getParentPath(path);
      const newPath = joinRemotePath(parentPath, newName);

      await window.sshterm?.sftpRename?.({
        sftpSessionId,
        oldPath: path,
        newPath
      });

      await refreshRemoteDirectory();
    },
    [refreshRemoteDirectory, sftpSessionId]
  );

  const handleDelete = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      if (!window.confirm(`Delete ${paths.length} item(s)?`)) {
        return;
      }

      await Promise.all(
        paths.map((path) =>
          window.sshterm?.sftpDelete?.({ sftpSessionId, path, recursive: true })
        )
      );

      await refreshRemoteDirectory();
    },
    [refreshRemoteDirectory, sftpSessionId]
  );

  const handleMkdir = useCallback(async () => {
    const name = window.prompt("New folder name:");
    if (!name) {
      return;
    }

    const nextPath = joinRemotePath(remotePath, name);
    await window.sshterm?.sftpMkdir?.({
      sftpSessionId,
      path: nextPath
    });

    await refreshRemoteDirectory();
  }, [refreshRemoteDirectory, remotePath, sftpSessionId]);

  const handleBookmark = useCallback(
    async (path: string) => {
      if (!hostId) {
        return;
      }

      const defaultName = path.split("/").pop() || path;
      const name = window.prompt("Bookmark name:", defaultName);
      if (!name) {
        return;
      }

      await window.sshterm?.sftpBookmarksUpsert?.({
        hostId,
        name,
        remotePath: path
      });
    },
    [hostId]
  );

  const handleFilterChange = useCallback(
    (text: string) => {
      setFilterText(activePane, text);
    },
    [activePane, setFilterText]
  );

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
      />

      <SftpDualPane
        store={store}
        onUpload={handleUpload}
        onDownload={handleDownload}
        onEdit={setEditingFile}
        onRename={handleRename}
        onDelete={handleDelete}
        onMkdir={handleMkdir}
        onBookmark={handleBookmark}
      />

      <TransferPanel />

      {editingFile && (
        <RemoteEditor
          sftpSessionId={sftpSessionId}
          remotePath={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}
    </div>
  );
}
