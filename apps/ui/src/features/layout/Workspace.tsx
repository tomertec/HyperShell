import { useStore } from "zustand";

import { BroadcastBar } from "../broadcast/BroadcastBar";
import { SftpTab } from "../sftp";
import { TerminalPane } from "../terminal/TerminalPane";
import { type Pane, layoutStore } from "./layoutStore";
import { TabBar } from "./TabBar";

function PaneView({
  pane,
  isActive,
  onActivate,
  onCloseTab
}: {
  pane: Pane;
  isActive: boolean;
  onActivate: () => void;
  onCloseTab: (sessionId: string) => void;
}) {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const replaceSessionId = useStore(layoutStore, (s) => s.replaceSessionId);

  const terminalTabs = tabs.filter((t) => !(t.type === "sftp" && t.sftpSessionId));
  const activeSftpTab =
    pane.sessionId
      ? tabs.find((t) => t.sessionId === pane.sessionId && t.type === "sftp" && t.sftpSessionId) ?? null
      : null;

  return (
    <div
      className={`flex-1 min-h-0 min-w-0 border-l border-border/40 first:border-l-0 relative ${
        isActive ? "shadow-[inset_0_1px_0_rgba(56,189,248,0.22)]" : ""
      }`}
      onClick={onActivate}
    >
      {activeSftpTab && (
        <div className="absolute inset-0 flex flex-col z-10">
          <SftpTab
            sftpSessionId={activeSftpTab.sftpSessionId!}
            hostId={activeSftpTab.hostId ?? activeSftpTab.profileId ?? ""}
            onClose={() => onCloseTab(activeSftpTab.sessionId)}
          />
        </div>
      )}

      {terminalTabs.map((tab) => {
        const isVisible = !activeSftpTab && tab.sessionId === pane.sessionId;
        const terminalTransport = tab.transport === "serial" ? "serial" : "ssh";
        return (
          <div
            key={tab.tabKey ?? tab.sessionId}
            className={`absolute inset-0 flex flex-col ${
              isVisible ? "z-10" : "invisible pointer-events-none"
            }`}
          >
            <TerminalPane
              title={tab.title}
              transport={terminalTransport}
              profileId={tab.profileId ?? tab.sessionId}
              sessionId={tab.preopened ? tab.sessionId : undefined}
              autoConnect={!tab.preopened}
              onSessionOpened={(sessionId) => {
                replaceSessionId(tab.sessionId, sessionId);
              }}
            />
          </div>
        );
      })}

      {!pane.sessionId && terminalTabs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
          Empty pane
        </div>
      )}
    </div>
  );
}

export function Workspace() {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const activateTab = useStore(layoutStore, (s) => s.activateTab);
  const panes = useStore(layoutStore, (s) => s.panes);
  const activePaneId = useStore(layoutStore, (s) => s.activePaneId);
  const activatePane = useStore(layoutStore, (s) => s.activatePane);

  const closeTab = (sessionId: string) => {
    const tab = layoutStore.getState().tabs.find((candidate) => candidate.sessionId === sessionId);
    if (tab?.type === "sftp" && tab.sftpSessionId) {
      void window.sshterm?.sftpDisconnect?.({ sftpSessionId: tab.sftpSessionId }).catch(() => {});
    } else {
      void window.sshterm?.closeSession?.({ sessionId }).catch(() => {});
    }

    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const nextActive =
        state.activeSessionId === sessionId
          ? nextTabs[nextTabs.length - 1]?.sessionId ?? null
          : state.activeSessionId;
      const nextPanes = state.panes.map((p) =>
        p.sessionId === sessionId ? { ...p, sessionId: null } : p
      );
      return { tabs: nextTabs, activeSessionId: nextActive, panes: nextPanes };
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BroadcastBar />
      <TabBar
        tabs={tabs}
        activeSessionId={activeSessionId}
        onActivate={activateTab}
        onClose={closeTab}
      />

      {tabs.length > 0 ? (
        <div className="flex-1 min-h-0 flex flex-row">
          {panes.map((pane) => (
            <PaneView
              key={pane.paneId}
              pane={pane}
              isActive={pane.paneId === activePaneId}
              onActivate={() => activatePane(pane.paneId)}
              onCloseTab={closeTab}
            />
          ))}
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
