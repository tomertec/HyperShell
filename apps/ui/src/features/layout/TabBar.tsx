import type { LayoutTab } from "./layoutStore";

export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

export function TabBar({ tabs, activeSessionId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end bg-base-800 px-1 pt-2 overflow-x-auto border-b border-border">
      {tabs.map((tab, index) => {
        const isActive = tab.sessionId === activeSessionId;
        return (
          <div key={tab.tabKey ?? tab.sessionId} className="flex items-end">
            {/* Tab separator */}
            {index > 0 && !isActive && tabs[index - 1]?.sessionId !== activeSessionId && (
              <div className="w-px h-4 bg-border self-center -mx-px" />
            )}
            <button
              onClick={() => onActivate(tab.sessionId)}
              className={`group relative flex items-center gap-1.5 px-3.5 py-2 text-[13px] rounded-t-lg transition-all duration-150 max-w-[200px] ${
                isActive
                  ? "bg-base-900 text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-base-700/40"
              }`}
            >
              <span className="truncate">{tab.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.sessionId);
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
            </button>
          </div>
        );
      })}
    </div>
  );
}
