import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LocalProfileRecord } from "@hypershell/shared";
import { LocalProfileIcon } from "../local/LocalProfileIcon";

export interface SidebarLocalListProps {
  profiles: LocalProfileRecord[];
  onConnect: (profile: LocalProfileRecord) => void;
  onReorder: (items: Array<{ id: string; sortOrder: number }>) => void;
  onRescan: () => void;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onToggleHidden: (profile: LocalProfileRecord, hidden: boolean) => void;
}

function SortableLocalItem({
  profile,
  showHidden,
  onConnect,
  onToggleHidden,
}: {
  profile: LocalProfileRecord;
  showHidden: boolean;
  onConnect: (profile: LocalProfileRecord) => void;
  onToggleHidden: (profile: LocalProfileRecord, hidden: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const rowContent = (
    <>
      <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1 flex items-center gap-1.5">
        <span className="truncate text-[13px] font-medium leading-tight text-text-primary">
          {profile.name}
        </span>
        {profile.color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: profile.color }}
          />
        )}
        {showHidden && profile.isHidden && (
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0 text-[10px] leading-4 text-text-muted">
            hidden
          </span>
        )}
      </div>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex items-center gap-1 px-1 py-0.5"
    >
      {profile.isAvailable ? (
        <button
          type="button"
          onClick={() => onConnect(profile)}
          className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm transition-all duration-150 hover:border-accent/50 hover:bg-base-700/60"
          title={`${profile.executable} — click to connect`}
        >
          {rowContent}
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm opacity-50 cursor-not-allowed"
          title={`${profile.executable} — unavailable`}
        >
          {rowContent}
        </button>
      )}
      {showHidden && profile.isHidden && (
        <button
          type="button"
          onClick={() => onToggleHidden(profile, false)}
          className="shrink-0 rounded p-1 text-text-muted transition-colors duration-150 hover:bg-base-700/60 hover:text-accent/80"
          title={`Unhide ${profile.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 8s2.5-4.5 6-4.5 6 4.5 6 4.5-2.5 4.5-6 4.5S2 8 2 8Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="8" r="1.6" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function SidebarLocalList({
  profiles,
  onConnect,
  onReorder,
  onRescan,
  showHidden,
  onToggleShowHidden,
  onToggleHidden,
}: SidebarLocalListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const visibleProfiles = useMemo(() => {
    const list = showHidden ? profiles : profiles.filter((p) => !p.isHidden);
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [profiles, showHidden]);

  const itemIds = useMemo(() => visibleProfiles.map((p) => p.id), [visibleProfiles]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visibleProfiles.findIndex((p) => p.id === active.id);
    const newIndex = visibleProfiles.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...visibleProfiles];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    onReorder(reordered.map((p, i) => ({ id: p.id, sortOrder: i })));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex items-center gap-1 px-1 pb-1 shrink-0">
        <button
          type="button"
          onClick={onRescan}
          className="h-7 rounded-md border border-border bg-base-750/70 px-2 text-[11px] text-text-secondary hover:border-accent/35 hover:text-text-primary transition-colors"
          title="Rescan for local shells"
        >
          Rescan
        </button>
        <button
          type="button"
          onClick={onToggleShowHidden}
          aria-pressed={showHidden}
          className={`h-7 rounded-md border px-2 text-[11px] transition-colors ${
            showHidden
              ? "border-accent/45 bg-accent/15 text-text-primary"
              : "border-border bg-base-750/70 text-text-secondary hover:border-accent/35 hover:text-text-primary"
          }`}
          title={showHidden ? "Hide hidden profiles" : "Show hidden profiles"}
        >
          {showHidden ? "Hide hidden" : "Show hidden"}
        </button>
      </div>

      <div className="space-y-0.5 px-1">
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {visibleProfiles.map((profile) => (
            <SortableLocalItem
              key={profile.id}
              profile={profile}
              showHidden={showHidden}
              onConnect={onConnect}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </SortableContext>

        {visibleProfiles.length === 0 && (
          <div className="px-2 py-6 text-xs text-text-muted text-center">
            No local shells found
          </div>
        )}
      </div>
    </DndContext>
  );
}
