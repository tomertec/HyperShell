import type { SerialProfileRecord, TagRecord } from "@sshterm/shared";
import { useStore } from "zustand";
import type { HostRecord } from "../hosts/HostsView";
import { settingsStore } from "../settings/settingsStore";
import { SidebarHostList } from "./SidebarHostList";
import { SidebarSerialList } from "./SidebarSerialList";
import { SidebarSection } from "./SidebarSection";

export interface SidebarProps {
  hosts: HostRecord[];
  tags: TagRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  lastConnectedAtByHostId: Record<string, string | null>;
  onConnectHost: (host: HostRecord) => void;
  onOpenSftpHost: (host: HostRecord) => void;
  onOpenConnectionHistory: (host: HostRecord) => void;
  onEditHost: (host: HostRecord) => void;
  onNewHost: () => void;
  onImportSshConfig: () => void;
  onImportPutty: () => void;
  onImportSshManager: () => void;

  onDuplicateHost: (host: HostRecord) => void;
  onDeleteHost: (host: HostRecord) => void;
  onToggleFavoriteHost: (host: HostRecord) => void;
  onSetHostColor: (host: HostRecord, color: string | null) => void;
  onReorderHosts: (items: Array<{ id: string; sortOrder: number; group: string }>) => void;
  serialProfiles: SerialProfileRecord[];
  onConnectSerial: (profile: SerialProfileRecord) => void;
  onEditSerial: (profile: SerialProfileRecord) => void;
  onNewSerial: () => void;
  onOpenSettings: () => void;
  collapsed?: boolean;
  restoreCount?: number;
  onRestore?: () => void;
  onDismissRestore?: () => void;
}

export function Sidebar({
  hosts,
  tags,
  activeSessionHostIds,
  connectingHostIds,
  lastConnectedAtByHostId,
  onConnectHost,
  onOpenSftpHost,
  onOpenConnectionHistory,
  onEditHost,
  onNewHost,
  onImportSshConfig,
  onImportPutty,
  onImportSshManager,

  onDuplicateHost,
  onDeleteHost,
  onToggleFavoriteHost,
  onSetHostColor,
  onReorderHosts,
  serialProfiles,
  onConnectSerial,
  onEditSerial,
  onNewSerial,
  onOpenSettings,
  collapsed = false,
  restoreCount,
  onRestore,
  onDismissRestore,
}: SidebarProps) {
  const showSerialInSidebar = useStore(
    settingsStore,
    (s) => s.settings.general.showSerialInSidebar
  );

  if (collapsed) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-1.5 pt-2">
          <button
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true })
              );
            }}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-all duration-150"
            title="Quick Connect (Ctrl+K)"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-auto border-t border-border px-1.5 py-2">
          <button
            onClick={onOpenSettings}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-base-700/60 transition-all duration-150"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

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
              onClick={onImportPutty}
              className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
              title="Import from PuTTY"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="1" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={onImportSshManager}
              className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
              title="Import from SshManager"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
                <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
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
          tags={tags}
          activeSessionHostIds={activeSessionHostIds}
          connectingHostIds={connectingHostIds}
          lastConnectedAtByHostId={lastConnectedAtByHostId}
          onConnect={onConnectHost}
          onOpenSftp={onOpenSftpHost}
          onOpenConnectionHistory={onOpenConnectionHistory}
          onEdit={onEditHost}
          onDuplicate={onDuplicateHost}
          onDelete={onDeleteHost}
          onToggleFavorite={onToggleFavoriteHost}
          onCopyHostname={(host) => void navigator.clipboard.writeText(host.hostname)}
          onCopyAddress={(host) => void navigator.clipboard.writeText(host.hostname)}
          onSetColor={onSetHostColor}
          onReorder={onReorderHosts}
        />
      </SidebarSection>

      {showSerialInSidebar && (
        <SidebarSection
          title="Serial"
          actions={
            <div className="flex gap-0.5">
              <button
                onClick={onNewSerial}
                className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
                title="New serial profile"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          }
        >
          <SidebarSerialList
            profiles={serialProfiles}
            onConnect={onConnectSerial}
            onEdit={onEditSerial}
          />
        </SidebarSection>
      )}

      {restoreCount != null && restoreCount > 0 && onRestore && onDismissRestore && (
        <div className="mt-auto border-t border-border px-3 py-2.5 flex flex-col gap-2">
          <span className="text-xs text-text-secondary">
            Restore {restoreCount} session{restoreCount === 1 ? "" : "s"} from last session?
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onRestore}
              className="rounded bg-accent/15 border border-accent/30 px-3 py-1 text-xs text-accent hover:bg-accent/25 transition-colors font-medium"
            >
              Restore
            </button>
            <button
              onClick={onDismissRestore}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className={`${restoreCount ? "" : "mt-auto "}border-t border-border px-3 pt-3 pb-2 flex items-end justify-between`}>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-1 py-0.5 rounded text-text-muted/80 hover:text-text-secondary hover:bg-base-700/60 transition-all duration-150"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs font-bold tracking-wide">Settings</span>
        </button>
        <div className="text-[10px] text-text-muted/60 tracking-wide select-none">HyperShell v0.1.0</div>
      </div>
    </div>
  );
}
