import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import type { SftpBookmark } from "@sshterm/shared";
import type { SftpStoreState } from "../sftpStore";

export interface SftpToolbarProps {
  store: StoreApi<SftpStoreState>;
  hostId: string;
  onDisconnect: () => void;
  filterText: string;
  onFilterChange: (text: string) => void;
  filterMatchCount: number;
  filterTotalCount: number;
  filterInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleSync?: () => void;
  syncActive?: boolean;
}

export function SftpToolbar({
  store,
  hostId,
  onDisconnect,
  filterText,
  onFilterChange,
  filterMatchCount,
  filterTotalCount,
  filterInputRef,
  onToggleSync,
  syncActive,
}: SftpToolbarProps) {
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
    <div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-2 py-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          title="Back"
          disabled={remoteHistoryIndex <= 0}
          onClick={() => back("remote")}
          className="rounded p-1 text-xs text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          ←
        </button>
        <button
          type="button"
          title="Forward"
          disabled={remoteHistoryIndex >= remoteHistory.length - 1}
          onClick={() => forward("remote")}
          className="rounded p-1 text-xs text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          →
        </button>
      </div>

      <div className="mx-1 h-4 w-px bg-base-700" />

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <input
          ref={filterInputRef}
          type="text"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter (Ctrl+F)"
          className="w-0 rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-muted/50 outline-none transition-all focus:w-44 focus:border focus:border-accent/50 [&:not(:placeholder-shown)]:w-44 [&:not(:placeholder-shown)]:border [&:not(:placeholder-shown)]:border-accent/50"
        />
        {filterText && (
          <span className="text-[10px] text-text-muted whitespace-nowrap">
            {filterMatchCount}/{filterTotalCount}
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowBookmarks((open) => !open)}
          className="rounded px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
        >
          Bookmarks ({bookmarks.length})
        </button>

        {showBookmarks && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-base-600 bg-base-800/95 py-0.5 shadow-xl shadow-black/30 backdrop-blur">
            {bookmarks.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-secondary">No bookmarks</div>
            ) : (
              bookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-1 text-left text-xs text-text-primary transition-colors hover:bg-base-700/80"
                  onClick={() => {
                    setRemotePath(bookmark.remotePath);
                    setShowBookmarks(false);
                  }}
                  title={bookmark.remotePath}
                >
                  <span className="truncate">{bookmark.name}</span>
                  <span className="max-w-[120px] truncate font-mono text-[10px] text-text-muted">
                    {bookmark.remotePath}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {onToggleSync && (
        <button
          type="button"
          onClick={onToggleSync}
          className={[
            "rounded px-2 py-0.5 text-xs transition-colors",
            syncActive
              ? "bg-accent/20 text-accent"
              : "text-text-secondary hover:bg-base-700 hover:text-text-primary",
          ].join(" ")}
        >
          Sync
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          void refreshBookmarks();
        }}
        className="rounded px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
      >
        Refresh
      </button>

      <button
        type="button"
        onClick={onDisconnect}
        className="rounded px-2 py-0.5 text-xs text-red-400/80 transition-colors hover:bg-red-400/10 hover:text-red-300"
      >
        Disconnect
      </button>
    </div>
  );
}
