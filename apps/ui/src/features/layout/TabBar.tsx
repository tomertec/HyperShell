import { useMemo, useRef, useState } from "react";
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
import type { LocalProfileRecord } from "@hypershell/shared";
import type { LayoutTab } from "./layoutStore";
import { NewTabMenu } from "./NewTabMenu";
import { sessionStateStore } from "../sessions/sessionStateStore";
import { IconButton } from "../../components/ui/IconButton";

const tabStateColors: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  waiting_for_network: "bg-warning",
  disconnected: "bg-text-muted/50",
  failed: "bg-danger",
};

const stateTextColors: Record<string, string> = {
  connected: "text-success",
  connecting: "text-warning",
  reconnecting: "text-warning",
  waiting_for_network: "text-warning",
  disconnected: "text-text-muted",
  failed: "text-danger",
};

export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  launchableProfiles: LocalProfileRecord[];
  onConnectLocal: (profile: LocalProfileRecord) => void;
}

function TabTooltip({ tab, sessionState }: { tab: LayoutTab; sessionState: string | undefined }) {
  const transport = tab.transport === "serial" ? "Serial" : tab.transport === "sftp" ? "SFTP" : tab.transport === "telnet" ? "Telnet" : "SSH";
  const state = sessionState ?? "disconnected";

  return (
    <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] py-2 px-3 rounded-lg bg-base-700 border border-border shadow-raised animate-menu-in text-xs pointer-events-none">
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
      <div className={`mt-1.5 flex items-center gap-1.5 uppercase tracking-wider text-[10px] font-medium ${stateTextColors[state] ?? "text-text-muted"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tabStateColors[state] ?? "bg-text-muted/50"}`} />
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`flex items-end ${isDragging ? "shadow-raised" : ""}`}>
      <button
        onClick={onActivate}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-t-lg transition-colors duration-(--motion-fast) ease-standard max-w-[200px] ${
          isActive
            ? "bg-base-900 text-text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-base-700/40"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${tabStateColors[sessionState ?? ""] ?? "bg-text-muted/50"} ${
            sessionState === "connecting" || sessionState === "reconnecting" ? "host-status-pulse" : ""
          }`}
        />
        <span className="truncate">{tab.title}</span>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- nested inside the tab <button>, so it cannot be a button; keyboard users close the tab with Ctrl+Shift+W */}
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

export function TabBar({
  tabs,
  activeSessionId,
  onActivate,
  onClose,
  onReorder,
  launchableProfiles,
  onConnectLocal,
}: TabBarProps) {
  const sessionStates = useStore(sessionStateStore, (s) => s.sessions);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTabButtonRef = useRef<HTMLButtonElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const tabIds = useMemo(() => tabs.map((t) => t.tabKey ?? t.sessionId), [tabs]);

  // Zero tabs and nothing launchable is exactly today's "nothing to show" case —
  // preserve it. Zero tabs with at least one launchable profile still needs the
  // "+" button rendered so a first tab can be opened from the tab bar too.
  if (tabs.length === 0 && launchableProfiles.length === 0) return null;

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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {/* The scrollable tab list and the "+" button/menu are siblings, not
          parent/child: a flex container with one non-`visible` overflow axis
          computes the other axis to `auto` too (CSS Overflow spec), so an
          `overflow-x-auto` div also clips vertically. Keeping the dropdown
          outside that container means it's never clipped, and the "+" stays
          reachable even when the tab list scrolls. */}
      <div className="flex h-full items-end bg-base-800 px-1 pt-2">
        <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
          <div
            data-testid="tab-scroll-container"
            className="flex h-full min-w-0 items-end overflow-x-auto"
          >
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
        {launchableProfiles.length > 0 && (
          <div className="relative flex items-center h-full pb-2 pl-0.5 shrink-0">
            <IconButton
              ref={newTabButtonRef}
              variant="ghost"
              onClick={() => setNewTabMenuOpen((v) => !v)}
              title="New Tab"
              className="h-6 w-6"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </IconButton>
            {newTabMenuOpen && (
              <NewTabMenu
                profiles={launchableProfiles}
                onSelect={onConnectLocal}
                onClose={() => setNewTabMenuOpen(false)}
                triggerRef={newTabButtonRef}
              />
            )}
          </div>
        )}
      </div>
    </DndContext>
  );
}
