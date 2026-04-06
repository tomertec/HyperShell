import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  onConnect: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
}

export function SidebarHostList({ hosts, onConnect, onEdit }: SidebarHostListProps) {
  const grouped = new Map<string, HostRecord[]>();
  for (const host of hosts) {
    const group = host.group || "Ungrouped";
    const list = grouped.get(group) ?? [];
    list.push(host);
    grouped.set(group, list);
  }

  return (
    <div className="space-y-0.5 px-1">
      {[...grouped.entries()].map(([group, groupHosts]) => (
        <div key={group}>
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70 select-none">
            {group}
          </div>
          {groupHosts.map((host) => (
            <button
              key={host.id}
              onDoubleClick={() => onConnect(host)}
              onClick={() => onEdit(host)}
              className="relative flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-left text-sm transition-all duration-150 group hover:bg-base-700/60 border-l-2 border-transparent hover:border-accent/50"
              title={`${host.hostname}:${host.port} — double-click to connect`}
            >
              {/* Status dot with glow */}
              <span className="relative shrink-0 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-text-muted/60 group-hover:bg-success transition-colors duration-200" />
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-success/0 group-hover:bg-success/30 blur-[3px] transition-all duration-200" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-text-primary truncate text-[13px] font-medium leading-tight">{host.name}</div>
                <div className="text-text-muted text-[11px] truncate leading-tight mt-0.5">
                  {host.username}@{host.hostname}:{host.port}
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
      {hosts.length === 0 && (
        <div className="px-2 py-6 text-xs text-text-muted text-center">
          No hosts yet
        </div>
      )}
    </div>
  );
}
