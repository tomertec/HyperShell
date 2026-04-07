import { useMemo, useState } from "react";
import { ContextMenu } from "../../components/ContextMenu";
import type { ContextMenuAction } from "../../components/ContextMenu";
import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
  onDuplicate: (host: HostRecord) => void;
  onDelete: (host: HostRecord) => void;
  onToggleFavorite: (host: HostRecord) => void;
  onCopyHostname: (host: HostRecord) => void;
  onCopyAddress: (host: HostRecord) => void;
}

export function SidebarHostList({
  hosts,
  onConnect,
  onOpenSftp,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopyHostname,
  onCopyAddress,
}: SidebarHostListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; host: HostRecord } | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, HostRecord[]>();
    for (const host of hosts) {
      const group = host.group || "Ungrouped";
      const list = map.get(group) ?? [];
      list.push(host);
      map.set(group, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    }
    return map;
  }, [hosts]);

  const buildContextMenuActions = (host: HostRecord): ContextMenuAction[] => [
    {
      label: "Connect",
      action: () => onConnect(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M5 3L13 8L5 13V3Z" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: host.isFavorite ? "Remove from Favorites" : "Add to Favorites",
      action: () => onToggleFavorite(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2L9.8 6H14L10.5 8.8L11.8 13L8 10.5L4.2 13L5.5 8.8L2 6H6.2L8 2Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "Edit Host",
      action: () => onEdit(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      label: "Copy Hostname",
      action: () => onCopyHostname(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Copy Address",
      action: () => onCopyAddress(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      label: "Duplicate",
      action: () => onDuplicate(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="5" width="8" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 5V3.5A1.5 1.5 0 017.5 2H12.5A1.5 1.5 0 0114 3.5V9.5A1.5 1.5 0 0112.5 11H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "SFTP Browser",
      action: () => onOpenSftp(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 4.5A1.5 1.5 0 013.5 3H6.5L8 5H12.5A1.5 1.5 0 0114 6.5V11.5A1.5 1.5 0 0112.5 13H3.5A1.5 1.5 0 012 11.5V4.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "Delete",
      action: () => onDelete(host),
      danger: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 5H13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6 5V3H10V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M4.5 5L5 13H11L11.5 5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-0.5 px-1">
      {[...grouped.entries()].map(([group, groupHosts]) => (
        <div key={group}>
          <div className="select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70">
            {group}
          </div>

          {groupHosts.map((host) => (
            <div key={host.id} className="group flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={() => onConnect(host)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, host });
                }}
                className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm transition-all duration-150 hover:border-accent/50 hover:bg-base-700/60"
                title={`${host.hostname}:${host.port} — click to connect`}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-text-muted/60 transition-colors duration-200 group-hover:bg-success" />
                  <span className="absolute inset-0 h-2 w-2 rounded-full bg-success/0 blur-[3px] transition-all duration-200 group-hover:bg-success/30" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[13px] font-medium leading-tight text-text-primary">
                    {host.isFavorite && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-warning shrink-0">
                        <path d="M8 1.5L9.8 5.7L14.4 6.2L11 9.3L11.9 14L8 11.6L4.1 14L5 9.3L1.6 6.2L6.2 5.7L8 1.5Z" />
                      </svg>
                    )}
                    {host.name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] leading-tight text-text-muted">
                    {host.username}@{host.hostname}:{host.port}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      ))}

      {hosts.length === 0 && (
        <div className="px-2 py-6 text-center text-xs text-text-muted">No hosts yet</div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextMenuActions(contextMenu.host)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
