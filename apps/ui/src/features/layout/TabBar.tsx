import { useRef, useState } from "react";
import { useStore } from "zustand";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LayoutTab } from "./layoutStore";
import { sessionStateStore } from "../sessions/sessionStateStore";

const tabStateColors: Record<string, string> = {
  connected: "bg-green-400",
  connecting: "bg-yellow-400",
  reconnecting: "bg-yellow-400",
  waiting_for_network: "bg-orange-400",
  disconnected: "bg-gray-400",
  failed: "bg-red-400",
};

const stateTextColors: Record<string, string> = {
  connected: "text-green-400",
  connecting: "text-yellow-400",
  reconnecting: "text-yellow-400",
  waiting_for_network: "text-orange-400",
  disconnected: "text-gray-400",
  failed: "text-red-400",
};

export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function TabTooltip({ tab, sessionState }: { tab: LayoutTab; sessionState: string | undefined }) {
  const transport = tab.transport === "serial" ? "Serial" : tab.transport === "sftp" ? "SFTP" : "SSH";
  const state = sessionState ?? "disconnected";

  return (
    <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] py-2 px-3 rounded-lg bg-base-700 border border-border shadow-xl text-xs pointer-events-none">
      <div className="font-medium text-text-primary text-[13px] mb-1">{tab.title}</div>
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="text-text-secondary">{transport}</span>
        {tab.profileId && (
          <>
            <span className="text-text-muted/50">&middot;</span>
            <span>{tab.profileId}</span>
          </>
        )}
      </div>
      <div className={`mt-1.5 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-medium ${stateTextColors[state] ?? "text-gray-400"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tabStateColors[state] ?? "bg-gray-400"}`} />
        {state}
      </div>
    </div>
  );
}

function SortableTab({
  tab,
  isActive,
  sessionState,
  onActivate,
  onClose,
  hoveredTab,
  onMouseEnter,
  onMouseLeave,
}: {
  tab: LayoutTab;
  isActive: boolean;
  sessionState: string | undefined;
  onActivate: () => void;
  onClose: () => void;
  hoveredTab: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.tabKey ?? tab.sessionId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="flex items-end">
      <button
        onClick={onActivate}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-t-lg transition-all duration-150 max-w-[200px] ${
          isActive
            ? "bg-base-900 text-text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-base-700/40"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tabStateColors[sessionState ?? ""] ?? "bg-gray-400"}`} />
        <span className="truncate">{tab.title}</span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-base-600/80 transition-all duration-100 text-text-muted hover:text-text-primary"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        {/* Active indicator — accent line at top */}
        {isActive && (
          <span className="absolute top-0 left-2 right-2 h-[2px] bg-accent rounded-b-full" />
        )}
        {/* Bottom edge blend for active tab */}
        {isActive && (
          <span className="absolute -bottom-px left-0 right-0 h-px bg-base-900" />
        )}
        {/* Hover tooltip */}
        {hoveredTab === tab.sessionId && (
          <TabTooltip tab={tab} sessionState={sessionState} />
        )}
      </button>
    </div>
  );
}

export function TabBar({ tabs, activeSessionId, onActivate, onClose, onReorder }: TabBarProps) {
  const sessionStates = useStore(sessionStateStore, (s) => s.sessions);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  if (tabs.length === 0) return null;

  const handleMouseEnter = (sessionId: string) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredTab(sessionId), 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = null;
    setHoveredTab(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tabs.findIndex((t) => (t.tabKey ?? t.sessionId) === active.id);
    const newIndex = tabs.findIndex((t) => (t.tabKey ?? t.sessionId) === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(oldIndex, newIndex);
    }
  };

  const tabIds = tabs.map((t) => t.tabKey ?? t.sessionId);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-end bg-base-800 px-1 pt-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.sessionId === activeSessionId;
            const sessionState = sessionStates[tab.sessionId]?.state;
            return (
              <SortableTab
                key={tab.tabKey ?? tab.sessionId}
                tab={tab}
                isActive={isActive}
                sessionState={sessionState}
                onActivate={() => onActivate(tab.sessionId)}
                onClose={() => onClose(tab.sessionId)}
                hoveredTab={hoveredTab}
                onMouseEnter={() => handleMouseEnter(tab.sessionId)}
                onMouseLeave={handleMouseLeave}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
