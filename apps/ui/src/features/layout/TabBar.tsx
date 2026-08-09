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
import { resolveTabTitle, type LayoutTab } from "./layoutStore";
import { NewTabMenu } from "./NewTabMenu";
import { TabIcon } from "./TabIcon";
import { sessionStateStore } from "../sessions/sessionStateStore";
import { settingsStore } from "../settings/settingsStore";
import {
  TAB_TITLE_COLOR_OPTIONS,
  getTabTitleColorCssValue,
  resolveTabTitleColor,
  type TabTitleColorId,
} from "../settings/tabTitleColors";
import { ContextMenu, type ContextMenuAction } from "../../components/ContextMenu";
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

function TabTooltip({
  tab,
  sessionState,
  showActiveProcess,
}: {
  tab: LayoutTab;
  sessionState: string | undefined;
  showActiveProcess: boolean;
}) {
  const transport = tab.transport === "serial" ? "Serial" : tab.transport === "sftp" ? "SFTP" : tab.transport === "telnet" ? "Telnet" : "SSH";
  const state = sessionState ?? "disconnected";
  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });

  return (
    <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] max-w-[320px] py-2 px-3 rounded-lg bg-base-700 border border-border shadow-raised animate-menu-in text-xs pointer-events-none">
      <div className="font-medium text-text-primary text-[13px] mb-1 break-words">{label}</div>
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="text-text-secondary">{transport}</span>
        {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
          <>
            <span className="text-text-muted/50">&middot;</span>
            <span>{tab.title}</span>
          </>
        )}
        {tab.profileId && (
          <>
            <span className="text-text-muted/50">&middot;</span>
            <span>{tab.profileId}</span>
          </>
        )}
      </div>
      {tab.processTitle && showActiveProcess && (
        <div className="mt-1 flex items-center gap-1.5 text-text-muted">
          <span>running</span>
          <span className="text-text-secondary">{tab.processTitle}</span>
        </div>
      )}
      {tab.dynamicTitle && tab.dynamicTitle !== tab.title && (
        <div className="mt-1 flex items-center gap-1.5 text-text-muted">
          <span>shell</span>
          <span className="text-text-secondary">{tab.dynamicTitle}</span>
        </div>
      )}
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
  showActiveProcess,
  onActivate,
  onClose,
  titleColor,
  onOpenColorMenu,
  hoveredTab,
  onMouseEnter,
  onMouseLeave,
}: {
  tab: LayoutTab;
  isActive: boolean;
  sessionState: string | undefined;
  showActiveProcess: boolean;
  onActivate: () => void;
  onClose: () => void;
  titleColor: TabTitleColorId | null;
  onOpenColorMenu: (x: number, y: number) => void;
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

  const label = resolveTabTitle(showActiveProcess ? tab : { ...tab, processTitle: undefined });
  const titleColorCss = titleColor ? getTabTitleColorCssValue(titleColor) : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`flex items-end ${isDragging ? "shadow-raised" : ""}`}>
      <button
        data-tab-title-color={titleColor ?? "default"}
        onClick={onActivate}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenColorMenu(event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (event.shiftKey && event.key === "F10") {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            onOpenColorMenu(bounds.left, bounds.bottom);
          }
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-t-lg transition-colors duration-(--motion-fast) ease-standard min-w-[110px] max-w-[220px] ${
          isActive
            ? "bg-base-900 text-text-primary"
            : "text-text-muted hover:text-text-primary hover:bg-base-700/40"
        }`}
      >
        <TabIcon
          tab={tab}
          sessionState={sessionState}
          isActive={isActive}
          color={titleColorCss}
        />
        <span
          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap pr-3 [mask-image:linear-gradient(to_right,black_calc(100%-14px),transparent)]"
          style={titleColorCss ? { color: titleColorCss } : undefined}
        >
          {label}
        </span>
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
          <TabTooltip tab={tab} sessionState={sessionState} showActiveProcess={showActiveProcess} />
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
  const showActiveProcess = useStore(settingsStore, (s) => s.settings.general.showActiveProcess);
  const tabTitleColors = useStore(
    settingsStore,
    (state) => state.settings.appearance.tabTitleColors
  );
  const updateTabTitleColor = useStore(settingsStore, (state) => state.updateTabTitleColor);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const [colorMenu, setColorMenu] = useState<{
    x: number;
    y: number;
    title: string;
  } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newTabButtonRef = useRef<HTMLButtonElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const tabIds = useMemo(() => tabs.map((t) => t.tabKey ?? t.sessionId), [tabs]);
  const selectedColor = colorMenu
    ? resolveTabTitleColor(colorMenu.title, tabTitleColors)
    : null;
  const colorMenuActions = useMemo<ContextMenuAction[]>(
    () =>
      colorMenu
        ? [
            {
              label: "Default",
              action: () => {
                void updateTabTitleColor(colorMenu.title, null);
              },
              shortcut: selectedColor === null ? "Current" : undefined,
            },
            { label: "palette-separator", action: () => {}, separator: true },
            ...TAB_TITLE_COLOR_OPTIONS.map((option) => ({
              label: option.label,
              action: () => {
                void updateTabTitleColor(colorMenu.title, option.id);
              },
              shortcut: selectedColor === option.id ? "Current" : undefined,
              icon: (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full ring-1 ring-white/15"
                  style={{ backgroundColor: option.cssValue }}
                />
              ),
            })),
          ]
        : [],
    [colorMenu, selectedColor, updateTabTitleColor]
  );

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
          {/* The scrollbar is hidden, not styled: a native horizontal scrollbar
              consumes layout height here, squishing the tabs and detaching the
              active tab from the terminal below it. Vertical wheel delta maps
              to horizontal scroll so overflowed tabs stay reachable. */}
          <div
            data-testid="tab-scroll-container"
            className="flex h-full min-w-0 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.sessionId === activeSessionId;
              const sessionState = sessionStates[tab.sessionId]?.state;
              const label = resolveTabTitle(
                showActiveProcess ? tab : { ...tab, processTitle: undefined }
              );
              const titleColor = resolveTabTitleColor(label, tabTitleColors);
              return (
                <SortableTab
                  key={tab.tabKey ?? tab.sessionId}
                  tab={tab}
                  isActive={isActive}
                  sessionState={sessionState}
                  showActiveProcess={showActiveProcess}
                  onActivate={() => onActivate(tab.sessionId)}
                  onClose={() => onClose(tab.sessionId)}
                  titleColor={titleColor}
                  onOpenColorMenu={(x, y) => setColorMenu({ x, y, title: label })}
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
      {colorMenu && (
        <ContextMenu
          x={colorMenu.x}
          y={colorMenu.y}
          actions={colorMenuActions}
          onClose={() => setColorMenu(null)}
        />
      )}
    </DndContext>
  );
}
