import { useStore } from "zustand";

import { TerminalPane } from "../terminal/TerminalPane";
import { layoutStore } from "./layoutStore";
import { TabBar } from "./TabBar";

export function Workspace() {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const activateTab = useStore(layoutStore, (s) => s.activateTab);
  const replaceSessionId = useStore(layoutStore, (s) => s.replaceSessionId);
  const activeTab =
    tabs.find((t) => t.sessionId === activeSessionId) ?? tabs[0] ?? null;

  const closeTab = (sessionId: string) => {
    window.sshterm?.closeSession?.({ sessionId }).catch(() => {});
    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const nextActive =
        state.activeSessionId === sessionId
          ? nextTabs[nextTabs.length - 1]?.sessionId ?? null
          : state.activeSessionId;
      return { tabs: nextTabs, activeSessionId: nextActive };
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabBar
        tabs={tabs}
        activeSessionId={activeSessionId}
        onActivate={activateTab}
        onClose={closeTab}
      />

      {activeTab ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <TerminalPane
            key={activeTab.tabKey ?? activeTab.sessionId}
            title={activeTab.title}
            transport={activeTab.transport ?? "ssh"}
            profileId={activeTab.profileId ?? activeTab.sessionId}
            sessionId={activeTab.preopened ? activeTab.sessionId : undefined}
            autoConnect={!activeTab.preopened}
            onSessionOpened={(sessionId) => {
              replaceSessionId(activeTab.sessionId, sessionId);
            }}
          />
        </div>
      ) : (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-4 text-text-secondary">
          {/* Subtle radial gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-base-900 via-base-900 to-base-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_40%,rgba(56,189,248,0.03),transparent)]" />

          <div className="relative flex flex-col items-center gap-4">
            {/* Terminal icon with glow */}
            <div className="relative">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="text-text-muted/50">
                <rect x="6" y="10" width="44" height="36" rx="6" stroke="currentColor" strokeWidth="1.5" />
                <rect x="6" y="10" width="44" height="36" rx="6" fill="currentColor" fillOpacity="0.03" />
                <path d="M16 24L24 32L16 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M28 40H40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                {/* Blinking cursor */}
                <rect x="29" y="38" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4">
                  <animate attributeName="opacity" values="0.4;0.1;0.4" dur="1.5s" repeatCount="indefinite" />
                </rect>
              </svg>
              {/* Subtle glow beneath icon */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-accent/[0.06] rounded-full blur-lg" />
            </div>

            <div className="text-center">
              <div className="text-sm font-medium text-text-secondary">No sessions open</div>
              <div className="text-xs text-text-muted mt-1.5">
                Double-click a host or press{" "}
                <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-base-700/80 text-text-secondary text-[11px] border border-border/50 font-medium">
                  Ctrl+K
                </kbd>{" "}
                to connect
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
