import { Fragment, useCallback, useRef, useState } from "react";
import { useStore } from "zustand";

import { WelcomeScreen } from "../welcome";
import { BroadcastBar, BroadcastButton } from "../broadcast/BroadcastBar";
import { SftpTab } from "../sftp";
import { TerminalPane } from "../terminal/TerminalPane";
import { useTunnelStore } from "../tunnels/tunnelStore";
import { WorkspaceMenu } from "../workspace/WorkspaceMenu";
import { type Pane, layoutStore } from "./layoutStore";
import { PaneResizeHandle } from "./PaneResizeHandle";
import { TabBar } from "./TabBar";

function PaneView({
  pane,
  isActive,
  activeSessionId,
  onActivate,
  onCloseTab
}: {
  pane: Pane;
  isActive: boolean;
  activeSessionId: string | null;
  onActivate: () => void;
  onCloseTab: (sessionId: string) => void;
}) {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const replaceSessionId = useStore(layoutStore, (s) => s.replaceSessionId);

  const terminalTabs = tabs.filter((t) => !(t.type === "sftp" && t.sftpSessionId));
  const hasTabForSession = (sessionId: string | null) =>
    sessionId ? tabs.some((t) => t.sessionId === sessionId) : false;
  const resolvedSessionId =
    pane.sessionId && hasTabForSession(pane.sessionId)
      ? pane.sessionId
      : isActive && activeSessionId && hasTabForSession(activeSessionId)
        ? activeSessionId
        : pane.sessionId;
  const activeSftpTab =
    resolvedSessionId
      ? tabs.find((t) => t.sessionId === resolvedSessionId && t.type === "sftp" && t.sftpSessionId) ?? null
      : null;

  return (
    <div
      className={`h-full min-h-0 min-w-0 border-l border-border/40 first:border-l-0 relative ${
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
        const isVisible = !activeSftpTab && tab.sessionId === resolvedSessionId;
        const terminalTransport = tab.transport === "serial" ? "serial" : "ssh";
        return (
          <div
            key={tab.tabKey ?? tab.sessionId}
            className={`absolute inset-0 flex flex-col ${
              isVisible ? "z-10" : "invisible pointer-events-none"
            }`}
          >
            <TerminalPane
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

      {!resolvedSessionId && terminalTabs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
          Empty pane
        </div>
      )}

      {!resolvedSessionId && terminalTabs.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
          Select a session tab
        </div>
      )}
    </div>
  );
}

interface WorkspaceProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number) => void;
}

export function Workspace({ availablePorts, onRefreshPorts, onConnectSsh, onConnectSerial }: WorkspaceProps) {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const activateTab = useStore(layoutStore, (s) => s.activateTab);
  const panes = useStore(layoutStore, (s) => s.panes);
  const activePaneId = useStore(layoutStore, (s) => s.activePaneId);
  const activatePane = useStore(layoutStore, (s) => s.activatePane);
  const splitDirection = useStore(layoutStore, (s) => s.splitDirection);
  const paneSizes = useStore(layoutStore, (s) => s.paneSizes);
  const setPaneSizes = useStore(layoutStore, (s) => s.setPaneSizes);
  const toggleTunnelPanel = useTunnelStore((s) => s.togglePanel);
  const containerRef = useRef<HTMLDivElement>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const handleResize = useCallback(
    (index: number, delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalPx =
        splitDirection === "horizontal" ? container.offsetWidth : container.offsetHeight;
      if (totalPx === 0) return;
      const deltaPct = (delta / totalPx) * 100;
      const next = [...paneSizes];
      const minSize = 10;
      const newLeft = next[index] + deltaPct;
      const newRight = next[index + 1] - deltaPct;
      if (newLeft >= minSize && newRight >= minSize) {
        next[index] = newLeft;
        next[index + 1] = newRight;
        setPaneSizes(next);
      }
    },
    [paneSizes, splitDirection, setPaneSizes]
  );

  const closeTab = (sessionId: string) => {
    const tab = layoutStore.getState().tabs.find((candidate) => candidate.sessionId === sessionId);
    if (tab?.type === "sftp" && tab.sftpSessionId) {
      void window.sshterm?.sftpDisconnect?.({ sftpSessionId: tab.sftpSessionId }).catch(() => {});
    } else {
      void window.sshterm?.closeSession?.({ sessionId }).catch(() => {});
    }

    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const closingActiveSession = state.activeSessionId === sessionId;
      const nextActive =
        closingActiveSession
          ? nextTabs[nextTabs.length - 1]?.sessionId ?? null
          : state.activeSessionId;
      const nextPanes = state.panes.map((p) => {
        if (p.sessionId !== sessionId) {
          return p;
        }

        if (closingActiveSession && p.paneId === state.activePaneId) {
          return { ...p, sessionId: nextActive };
        }

        return { ...p, sessionId: null };
      });

      const normalizedPanes =
        closingActiveSession
          ? nextPanes.map((p) =>
              p.paneId === state.activePaneId ? { ...p, sessionId: nextActive } : p
            )
          : nextPanes;

      return { tabs: nextTabs, activeSessionId: nextActive, panes: normalizedPanes };
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <BroadcastBar />
      <div className="flex items-end bg-base-800 border-b border-border">
        <div className="flex-1 min-w-0">
          <TabBar
            tabs={tabs}
            activeSessionId={activeSessionId}
            onActivate={activateTab}
            onClose={closeTab}
          />
        </div>
        <div className="relative flex items-center gap-0.5 px-2 pb-1.5 pt-2">
          <BroadcastButton />
          <button
            onClick={toggleTunnelPanel}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
            title="Tunnels"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </button>
          <button
            onClick={() => setWorkspaceMenuOpen((prev) => !prev)}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-colors"
            title="Workspaces"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          {workspaceMenuOpen && (
            <WorkspaceMenu onClose={() => setWorkspaceMenuOpen(false)} />
          )}
        </div>
      </div>

      {tabs.length > 0 ? (
        <div
          ref={containerRef}
          className={`flex-1 min-h-0 flex ${
            splitDirection === "horizontal" ? "flex-row" : "flex-col"
          }`}
        >
          {panes.map((pane, i) => (
            <Fragment key={pane.paneId}>
              {i > 0 && (
                <PaneResizeHandle
                  direction={splitDirection}
                  onResize={(delta) => handleResize(i - 1, delta)}
                  onResizeEnd={() => {}}
                />
              )}
              <div
                style={{
                  [splitDirection === "horizontal" ? "width" : "height"]: `${paneSizes[i] ?? 100}%`,
                }}
                className="h-full min-h-0 min-w-0 relative"
              >
                <PaneView
                  pane={pane}
                  isActive={pane.paneId === activePaneId}
                  activeSessionId={activeSessionId}
                  onActivate={() => activatePane(pane.paneId)}
                  onCloseTab={closeTab}
                />
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <WelcomeScreen
          availablePorts={availablePorts}
          onRefreshPorts={onRefreshPorts}
          onConnectSsh={onConnectSsh}
          onConnectSerial={onConnectSerial}
        />
      )}
    </div>
  );
}
