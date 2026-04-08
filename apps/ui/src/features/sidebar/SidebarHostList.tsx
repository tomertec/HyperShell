import { useMemo, useState } from "react";
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
import { ContextMenu } from "../../components/ContextMenu";
import type { ContextMenuAction } from "../../components/ContextMenu";
import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
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

function StatusDot({ hostId, activeSessionHostIds, connectingHostIds }: {
  hostId: string;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
}) {
  if (connectingHostIds.has(hostId)) {
    return <span className="host-status-connecting shrink-0" />;
  }
  if (activeSessionHostIds.has(hostId)) {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="absolute inset-0 h-2 w-2 rounded-full bg-success/30 blur-[3px]" />
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
  onConnect,
  showDivider,
  onContextMenu,
}: {
  host: HostRecord;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
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
        />

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
  activeSessionHostIds,
  connectingHostIds,
  onConnect,
  onOpenSftp,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopyHostname,
  onCopyAddress,
  onSetColor,
  onReorder,
}: SidebarHostListProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; host: HostRecord } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const grouped = useMemo(() => {
    const map = new Map<string, HostRecord[]>();
    for (const host of hosts) {
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
  }, [hosts]);

  const allHostIds = useMemo(() => hosts.map((h) => h.id), [hosts]);
  const activeHost = activeId ? hosts.find((h) => h.id === activeId) : null;

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
      <div className="space-y-0.5 px-1">
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
            />
            <span className="text-[13px] font-medium text-text-primary">{activeHost.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
