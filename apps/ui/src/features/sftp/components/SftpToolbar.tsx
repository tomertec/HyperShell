import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpBookmark } from "@sshterm/shared";
import type { SftpStoreState } from "../sftpStore";

export interface SftpToolbarProps {
  store: StoreApi<SftpStoreState>;
  hostId: string;
  onDisconnect: () => void;
}

export function SftpToolbar({ store, hostId, onDisconnect }: SftpToolbarProps) {
  const back = useStore(store, (state) => state.back);
  const forward = useStore(store, (state) => state.forward);
  const remoteHistory = useStore(store, (state) => state.remoteHistory);
  const remoteHistoryIndex = useStore(store, (state) => state.remoteHistoryIndex);
  const setRemotePath = useStore(store, (state) => state.setRemotePath);

  const [bookmarks, setBookmarks] = useState<SftpBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  const refreshBookmarks = useCallback(async () => {
    if (!hostId) {
      setBookmarks([]);
      return;
    }

    try {
      const list = await window.sshterm?.sftpBookmarksList?.({ hostId });
      setBookmarks(list ?? []);
    } catch {
      setBookmarks([]);
    }
  }, [hostId]);

  useEffect(() => {
    void refreshBookmarks();
  }, [refreshBookmarks]);

  return (
    <div className="flex items-center gap-2 border-b border-base-700 bg-base-900 px-3 py-1.5">
      <button
        type="button"
        title="Back"
        disabled={remoteHistoryIndex <= 0}
        onClick={() => back("remote")}
        className="px-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30"
      >
        ←
      </button>
      <button
        type="button"
        title="Forward"
        disabled={remoteHistoryIndex >= remoteHistory.length - 1}
        onClick={() => forward("remote")}
        className="px-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30"
      >
        →
      </button>

      <div className="flex-1" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowBookmarks((open) => !open)}
          className="rounded border border-base-600 px-2 py-0.5 text-sm text-text-secondary hover:text-text-primary"
        >
          Bookmarks ({bookmarks.length})
        </button>

        {showBookmarks && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded border border-base-600 bg-base-800 py-1 shadow-lg">
            {bookmarks.length === 0 ? (
              <div className="px-4 py-2 text-sm text-text-secondary">No bookmarks</div>
            ) : (
              bookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left text-sm text-text-primary hover:bg-base-700"
                  onClick={() => {
                    setRemotePath(bookmark.remotePath);
                    setShowBookmarks(false);
                  }}
                  title={bookmark.remotePath}
                >
                  <span className="truncate">{bookmark.name}</span>
                  <span className="max-w-[120px] truncate text-xs text-text-secondary">
                    {bookmark.remotePath}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          void refreshBookmarks();
        }}
        className="rounded border border-base-600 px-2 py-0.5 text-sm text-text-secondary hover:text-text-primary"
      >
        Refresh
      </button>

      <button
        type="button"
        onClick={onDisconnect}
        className="rounded border border-red-400/30 px-2 py-0.5 text-sm text-red-400 hover:text-red-300"
      >
        Disconnect
      </button>
    </div>
  );
}
