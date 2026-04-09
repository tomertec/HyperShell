import { cloneElement, isValidElement, useState } from "react";
import { motion } from "framer-motion";
import { TunnelManagerPanel } from "../tunnels/TunnelManagerPanel";

export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarContent = isValidElement(sidebar)
    ? cloneElement(sidebar as React.ReactElement<{ collapsed?: boolean }>, {
        collapsed: !sidebarOpen
      })
    : sidebar;

  return (
    <div className="flex flex-col h-full">
      {/* Custom title bar — replaces native title bar */}
      <div
        className="flex items-center h-9 shrink-0 bg-base-800 border-b border-border select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="flex-1 text-center text-xs font-medium text-text-muted tracking-wide pointer-events-none">
          HyperShell
        </span>
        {/* Reserve space for the window controls overlay on the right */}
        <div className="w-[140px] shrink-0" />
      </div>

      <div className="flex flex-1 min-h-0">
        <aside
          className={`relative flex flex-col bg-base-800 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
            sidebarOpen ? "w-64" : "w-12"
          }`}
          style={{ borderRight: '0.5px solid var(--terminal-frame-line)' }}
        >
          {/* Subtle gradient overlay on sidebar */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.02] via-transparent to-transparent" />
          {/* Right edge highlight */}
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-accent/[0.06] via-transparent to-transparent" />

          <div className="terminal-logo-row relative flex h-11 items-center justify-end px-3">
            {sidebarOpen && (
              <span className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
                <span
                  className="text-sm font-semibold text-text-primary tracking-tight"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  HyperShell
                </span>
                <span
                  className="text-accent/75 text-sm font-light"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {">_"}
                </span>
                <motion.span
                  className="inline-block w-[2px] h-[14px] bg-accent ml-0.5 rounded-full"
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "steps(1)" }}
                />
              </span>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-base-700/70 transition-all duration-150"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={`transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`}
              >
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="relative flex-1 overflow-y-auto py-2">
            {sidebarContent}
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 bg-surface">
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </main>

        <TunnelManagerPanel />
      </div>
    </div>
  );
}
