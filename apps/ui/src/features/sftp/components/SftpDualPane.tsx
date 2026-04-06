import { useCallback, useRef, useState } from "react";
import type { StoreApi } from "zustand";

import type { SftpStoreState } from "../sftpStore";
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
}

export function SftpDualPane({
  store,
  onUpload,
  onDownload,
  onEdit,
  onRename,
  onDelete,
  onMkdir,
  onBookmark
}: SftpDualPaneProps) {
  const [splitRatio, setSplitRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

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
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div
        style={{ width: `${splitRatio * 100}%` }}
        className="flex min-w-[260px] flex-col border-r border-base-700"
      >
        <LocalPane store={store} onTransfer={onUpload} />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        className="w-1 cursor-col-resize bg-base-700 transition-colors hover:bg-accent"
        onMouseDown={handleMouseDown}
      />

      <div
        style={{ width: `${(1 - splitRatio) * 100}%` }}
        className="flex min-w-[260px] flex-col"
      >
        <RemotePane
          store={store}
          onTransfer={onDownload}
          onEdit={onEdit}
          onRename={onRename}
          onDelete={onDelete}
          onMkdir={onMkdir}
          onBookmark={onBookmark}
        />
      </div>
    </div>
  );
}
