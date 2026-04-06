import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
}

export function SidebarHostList({
  hosts,
  onConnect,
  onOpenSftp,
  onEdit
}: SidebarHostListProps) {
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
          <div className="select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70">
            {group}
          </div>

          {groupHosts.map((host) => (
            <div key={host.id} className="group flex items-center gap-2 px-1">
              <button
                type="button"
                onDoubleClick={() => onConnect(host)}
                onClick={() => onEdit(host)}
                className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm transition-all duration-150 hover:border-accent/50 hover:bg-base-700/60"
                title={`${host.hostname}:${host.port} — double-click to connect`}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-text-muted/60 transition-colors duration-200 group-hover:bg-success" />
                  <span className="absolute inset-0 h-2 w-2 rounded-full bg-success/0 blur-[3px] transition-all duration-200 group-hover:bg-success/30" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium leading-tight text-text-primary">
                    {host.name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] leading-tight text-text-muted">
                    {host.username}@{host.hostname}:{host.port}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="shrink-0 rounded border border-border/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-muted hover:border-accent/40 hover:text-accent"
                title={`Open SFTP for ${host.name}`}
                onClick={() => onOpenSftp(host)}
              >
                SFTP
              </button>
            </div>
          ))}
        </div>
      ))}

      {hosts.length === 0 && (
        <div className="px-2 py-6 text-center text-xs text-text-muted">No hosts yet</div>
      )}
    </div>
  );
}
