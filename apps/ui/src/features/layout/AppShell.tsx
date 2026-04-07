import { useState } from "react";
import { TunnelManagerPanel } from "../tunnels/TunnelManagerPanel";
import { StatusBar } from "../statusbar/StatusBar";

export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full">
      {/* Electron drag region — thin strip at the very top */}
      <div
        className="fixed top-0 left-0 right-0 h-2 z-[100]"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      <aside
        className={`relative flex flex-col border-r border-border bg-base-800 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          sidebarOpen ? "w-64" : "w-12"
        }`}
      >
        {/* Subtle gradient overlay on sidebar */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/[0.02] via-transparent to-transparent" />
        {/* Right edge highlight */}
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-accent/[0.06] via-transparent to-transparent" />

        <div className="relative flex items-center justify-between px-3 py-2.5 border-b border-border">
          {sidebarOpen && (
            <span className="text-sm font-semibold text-text-primary tracking-tight select-none">
              HyperShell
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

        {sidebarOpen && (
          <div className="relative flex-1 overflow-y-auto py-2">
            {sidebar}
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-surface">
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
        <StatusBar />
      </main>

      <TunnelManagerPanel />
    </div>
  );
}
