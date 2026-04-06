import type { HostRecord } from "../hosts/HostsView";
import { SidebarHostList } from "./SidebarHostList";
import { SidebarSection } from "./SidebarSection";

export interface SidebarProps {
  hosts: HostRecord[];
  onConnectHost: (host: HostRecord) => void;
  onEditHost: (host: HostRecord) => void;
  onNewHost: () => void;
  onImportSshConfig: () => void;
}

export function Sidebar({
  hosts,
  onConnectHost,
  onEditHost,
  onNewHost,
  onImportSshConfig
}: SidebarProps) {

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true })
          );
        }}
        className="group mx-3 mt-2 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-base-750/40 text-xs text-text-secondary hover:text-text-primary hover:border-accent/30 hover:bg-accent/[0.04] transition-all duration-150"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted group-hover:text-accent/70 transition-colors duration-150">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left">Quick Connect</span>
        <kbd className="text-[10px] text-text-muted bg-base-700/80 px-1.5 py-0.5 rounded border border-border/50">Ctrl+K</kbd>
      </button>

      <SidebarSection
        title="Hosts"
        actions={
          <div className="flex gap-0.5">
            <button
              onClick={onImportSshConfig}
              className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
              title="Import SSH config"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={onNewHost}
              className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
              title="New host"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        }
      >
        <SidebarHostList
          hosts={hosts}
          onConnect={onConnectHost}
          onEdit={onEditHost}
        />
      </SidebarSection>

      <div className="mt-auto border-t border-border px-3 py-2">
        <div className="text-[10px] text-text-muted/60 tracking-wide select-none">SSHTerm v0.1.0</div>
      </div>
    </div>
  );
}
