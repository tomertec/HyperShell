import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { TagRecord } from "@hypershell/shared";
import { ContextMenu } from "../../components/ContextMenu";
import type { ContextMenuAction } from "../../components/ContextMenu";
import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  tags: TagRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  showFilter?: boolean;
  onCloseFilter?: () => void;
  lastConnectedAtByHostId: Record<string, string | null>;
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
  onOpenConnectionHistory: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
  onDuplicate: (host: HostRecord) => void;
  onDelete: (host: HostRecord) => void;
  onToggleFavorite: (host: HostRecord) => void;
  onCopyHostname: (host: HostRecord) => void;
  onCopyAddress: (host: HostRecord) => void;
  onSetColor: (host: HostRecord, color: string | null) => void;
  onReorder: (items: Array<{ id: string; sortOrder: number; group: string }>) => void;
}

const HOST_COLORS = ["red", "orange", "yellow", "green", "blue", "cyan", "purple", "pink"] as const;
type HostExportFormat = "json" | "csv" | "ssh-config";
type HostReachability = "online" | "offline" | "unknown";

const HOST_EXPORT_OPTIONS: Array<{
  value: HostExportFormat;
  label: string;
  extension: string;
  filterName: string;
}> = [
  { value: "json", label: "JSON", extension: "json", filterName: "JSON" },
  { value: "csv", label: "CSV", extension: "csv", filterName: "CSV" },
  { value: "ssh-config", label: "SSH Config", extension: "conf", filterName: "SSH Config" },
];

function formatLastConnected(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function StatusDot({ hostId, activeSessionHostIds, connectingHostIds, hostReachabilityById }: {
  hostId: string;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  hostReachabilityById: Record<string, HostReachability>;
}) {
  if (connectingHostIds.has(hostId)) {
    return <span className="host-status-connecting shrink-0" />;
  }
  if (activeSessionHostIds.has(hostId)) {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success host-status-pulse" />
      </span>
    );
  }
  const reachability = hostReachabilityById[hostId] ?? "unknown";
  if (reachability === "online") {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success" />
      </span>
    );
  }
  if (reachability === "offline") {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-danger" />
      </span>
    );
  }
  return (
    <span className="relative flex shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-text-muted/40" />
    </span>
  );
}

function SortableHostItem({
  host,
  activeSessionHostIds,
  connectingHostIds,
  hostReachabilityById,
  onConnect,
  showDivider,
  onContextMenu,
}: {
  host: HostRecord;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  hostReachabilityById: Record<string, HostReachability>;
  onConnect: (host: HostRecord) => void;
  showDivider: boolean;
  onContextMenu: (e: React.MouseEvent, host: HostRecord) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: host.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex items-center gap-2 px-1 py-0.5"
    >
      <button
        type="button"
        onClick={() => onConnect(host)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, host);
        }}
        className={`relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 ${
          host.color ? `host-color-${host.color}` : "border-transparent hover:border-accent/50"
        } px-2 py-1.5 text-left text-sm transition-all duration-150 hover:bg-base-700/60`}
        title={`${host.hostname}:${host.port} — click to connect`}
      >
        <StatusDot
          hostId={host.id}
          activeSessionHostIds={activeSessionHostIds}
          connectingHostIds={connectingHostIds}
          hostReachabilityById={hostReachabilityById}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate font-mono text-[12.5px] font-semibold leading-tight tracking-tight text-text-primary">
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
      {showDivider && !isDragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-px left-8 right-2 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
        />
      )}
    </div>
  );
}

export function SidebarHostList({
  hosts,
  tags,
  activeSessionHostIds,
  connectingHostIds,
  lastConnectedAtByHostId,
  onConnect,
  onOpenSftp,
  onOpenConnectionHistory,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopyHostname,
  onCopyAddress,
  onSetColor,
  onReorder,
  showFilter = false,
  onCloseFilter,
}: SidebarHostListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; host: HostRecord } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<HostExportFormat>("json");
  const [hostReachabilityById, setHostReachabilityById] = useState<
    Record<string, HostReachability>
  >({});
  const filterInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredHosts = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    const selectedIdSet = new Set(selectedTagIds);

    return hosts.filter((host) => {
      const matchesQuery =
        query.length === 0 ||
        host.name.toLowerCase().includes(query) ||
        host.hostname.toLowerCase().includes(query) ||
        (host.group && host.group.toLowerCase().includes(query)) ||
        (host.tags && host.tags.toLowerCase().includes(query)) ||
        host.username.toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (selectedIdSet.size === 0) {
        return true;
      }

      const hostTagIds = host.tagIds ?? [];
      return hostTagIds.some((tagId) => selectedIdSet.has(tagId));
    });
  }, [filterQuery, hosts, selectedTagIds]);

  const tagHostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const host of hosts) {
      for (const tagId of host.tagIds ?? []) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
    return counts;
  }, [hosts]);

  useEffect(() => {
    const knownIds = new Set(tags.map((tag) => tag.id));
    setSelectedTagIds((previous) =>
      previous.filter((tagId) => knownIds.has(tagId))
    );
  }, [tags]);

  useEffect(() => {
    if (showFilter) {
      filterInputRef.current?.focus();
    } else {
      setFilterQuery("");
    }
  }, [showFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, HostRecord[]>();
    for (const host of filteredHosts) {
      const group = host.group || "Ungrouped";
      const list = map.get(group) ?? [];
      list.push(host);
      map.set(group, list);
    }
    // Sort within groups: favorites first, then by sortOrder, then name
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
        const aOrder = a.sortOrder ?? 999999;
        const bOrder = b.sortOrder ?? 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [filteredHosts]);

  const allHostIds = useMemo(() => filteredHosts.map((h) => h.id), [filteredHosts]);
  const activeHost = activeId ? hosts.find((h) => h.id === activeId) : null;

  const setStatusTargets = useCallback((hostIds: string[]) => {
    if (!window.hypershell?.setHostStatusTargets) {
      return;
    }
    void window.hypershell.setHostStatusTargets({ hostIds });
  }, []);

  useEffect(() => {
    if (!window.hypershell?.onHostStatus) {
      return;
    }

    return window.hypershell.onHostStatus((event) => {
      setHostReachabilityById((prev) => {
        const next = event.online ? "online" : "offline";
        if (prev[event.hostId] === next) {
          return prev;
        }
        return {
          ...prev,
          [event.hostId]: next,
        };
      });
    });
  }, []);

  useEffect(() => {
    setStatusTargets(filteredHosts.map((host) => host.id));
  }, [filteredHosts, setStatusTargets]);

  useEffect(() => {
    return () => {
      setStatusTargets([]);
    };
  }, [setStatusTargets]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find current flat order and compute new order
    const flatHosts: HostRecord[] = [];
    for (const [, groupHosts] of grouped) {
      flatHosts.push(...groupHosts);
    }

    const oldIndex = flatHosts.findIndex((h) => h.id === active.id);
    const newIndex = flatHosts.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Move host to new position
    const [moved] = flatHosts.splice(oldIndex, 1);
    flatHosts.splice(newIndex, 0, moved);

    // Update the moved host's group to match its new neighbor
    const overHost = hosts.find((h) => h.id === over.id);
    if (overHost && moved.group !== overHost.group) {
      moved.group = overHost.group;
    }

    // Emit new sort orders
    const items = flatHosts.map((h, i) => ({
      id: h.id,
      sortOrder: i,
      group: h.group || "Ungrouped",
    }));
    onReorder(items);
  }

  const handleExportHosts = useCallback(async () => {
    const option = HOST_EXPORT_OPTIONS.find((item) => item.value === exportFormat);
    if (!option) {
      toast.error("Unsupported export format selected.");
      return;
    }

    if (!window.hypershell?.fsShowSaveDialog || !window.hypershell?.exportHosts) {
      toast.error("Host export is unavailable in this environment.");
      return;
    }

    const filePath = await window.hypershell.fsShowSaveDialog({
      defaultPath: `hosts.${option.extension}`,
      filters: [{ name: option.filterName, extensions: [option.extension] }],
    });
    if (!filePath) {
      return;
    }

    try {
      const result = await window.hypershell.exportHosts({ format: exportFormat, filePath });
      toast.success(`Exported ${result.exported} host${result.exported === 1 ? "" : "s"} to ${filePath}`);
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [exportFormat]);

  const toggleTagFilter = useCallback((tagId: string) => {
    setSelectedTagIds((previous) => {
      if (previous.includes(tagId)) {
        return previous.filter((id) => id !== tagId);
      }
      return [...previous, tagId];
    });
  }, []);

  const buildContextMenuActions = (host: HostRecord): ContextMenuAction[] => [
    {
      label: `Last connected: ${formatLastConnected(lastConnectedAtByHostId[host.id])}`,
      action: () => {},
      disabled: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 4.8V8L10.2 9.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
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
          <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
      label: "Copy SSH Command",
      action: () => {
        const parts = ["ssh"];
        if (host.port && host.port !== 22) parts.push(`-p ${host.port}`);
        if (host.identityFile) parts.push(`-i "${host.identityFile}"`);
        if (host.proxyJump) parts.push(`-J ${host.proxyJump}`);
        parts.push(host.username ? `${host.username}@${host.hostname}` : host.hostname);
        void navigator.clipboard.writeText(parts.join(" "));
      },
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 4L6 8L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 13H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
      label: "color-picker",
      action: () => {},
      customContent: (
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          {HOST_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => { onSetColor(host, color); setContextMenu(null); }}
              className={`color-swatch color-swatch-${color} h-4 w-4 rounded-full transition-transform hover:scale-125 ${host.color === color ? "ring-2 ring-white/70 ring-offset-1 ring-offset-base-800" : ""}`}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            />
          ))}
          <button
            type="button"
            onClick={() => { onSetColor(host, null); setContextMenu(null); }}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-text-muted hover:text-text-primary transition-colors"
            title="Clear Color"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "SFTP Browser",
      action: () => onOpenSftp(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5A1.5 1.5 0 013.5 3H6.5L8 5H12.5A1.5 1.5 0 0114 6.5V11.5A1.5 1.5 0 0112.5 13H3.5A1.5 1.5 0 012 11.5V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: "Connection History",
      action: () => onOpenConnectionHistory(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8A4.5 4.5 0 118 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3.5 5.5V8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
          <path d="M4.5 5L5 13H11L11.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col min-h-0 flex-1 px-1">
        {/* Filter (toggled from Quick Connect magnifier) */}
        {showFilter && (
          <div className="flex items-center gap-1 px-1 pb-1 shrink-0">
            <div className="relative min-w-0 flex-1">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60"
              >
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={filterInputRef}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFilterQuery("");
                    onCloseFilter?.();
                  }
                }}
                placeholder="Filter hosts..."
                className="w-full rounded-md border border-transparent bg-base-750/40 py-1 pl-7 pr-6 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/30 focus:bg-base-750/60 focus:outline-none transition-colors duration-150"
              />
              <button
                type="button"
                onClick={() => {
                  setFilterQuery("");
                  onCloseFilter?.();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-sm text-text-muted/60 hover:text-text-primary transition-colors duration-150"
                title="Close filter"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Export */}
        <div className="flex items-center gap-1 px-1 pb-1 shrink-0">
          <select
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as HostExportFormat)}
            className="h-7 rounded-md border border-border bg-base-750/70 px-2 text-[11px] text-text-secondary focus:border-accent/40 focus:outline-none"
            title="Export format"
          >
            {HOST_EXPORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { void handleExportHosts(); }}
            className="h-7 rounded-md border border-border bg-base-750/70 px-2 text-[11px] text-text-secondary hover:border-accent/35 hover:text-text-primary transition-colors"
            title="Export hosts"
          >
            Export
          </button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-1 pb-1.5 shrink-0">
            {tags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              const hostCount = tagHostCounts.get(tag.id) ?? 0;
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTagFilter(tag.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    selected
                      ? "border-accent/45 bg-accent/15 text-text-primary"
                      : "border-border bg-base-800/65 text-text-secondary hover:text-text-primary"
                  }`}
                  title={`${tag.name} (${hostCount})`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#64748b" }}
                  />
                  <span>{tag.name}</span>
                  <span className="text-[10px] text-text-muted/80">{hostCount}</span>
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTagIds([])}
                className="ml-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-primary"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Scrollable host cards */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          <SortableContext items={allHostIds} strategy={verticalListSortingStrategy}>
            {[...grouped.entries()].map(([group, groupHosts]) => (
              <div key={group}>
                <div className="select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70">
                  {group}
                </div>

                {groupHosts.map((host, index) => (
                  <SortableHostItem
                    key={host.id}
                    host={host}
                    activeSessionHostIds={activeSessionHostIds}
                    connectingHostIds={connectingHostIds}
                    hostReachabilityById={hostReachabilityById}
                    onConnect={onConnect}
                    showDivider={index < groupHosts.length - 1}
                    onContextMenu={(e, h) => setContextMenu({ x: e.clientX, y: e.clientY, host: h })}
                  />
                ))}
              </div>
            ))}
          </SortableContext>

          {hosts.length === 0 && (
            <div className="px-2 py-6 text-center text-xs text-text-muted">No hosts yet</div>
          )}

          {hosts.length > 0 && filteredHosts.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-text-muted">No matching hosts</div>
          )}
        </div>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={buildContextMenuActions(contextMenu.host)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      <DragOverlay>
        {activeHost ? (
          <div className="flex items-center gap-2.5 rounded-md border border-accent/30 bg-base-800/95 px-2 py-1.5 text-sm shadow-lg backdrop-blur">
            <StatusDot
              hostId={activeHost.id}
              activeSessionHostIds={activeSessionHostIds}
              connectingHostIds={connectingHostIds}
              hostReachabilityById={hostReachabilityById}
            />
            <span className="text-[13px] font-medium text-text-primary">{activeHost.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
