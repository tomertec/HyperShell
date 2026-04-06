import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import { broadcastStore } from "../features/broadcast/broadcastStore";
import type { HostFormValue } from "../features/hosts/HostForm";
import { HostForm } from "../features/hosts/HostForm";
import type { HostRecord } from "../features/hosts/HostsView";
import {
  SshConfigImportDialog,
  type SshConfigImportItem
} from "../features/hosts/SshConfigImportDialog";
import { AppShell } from "../features/layout/AppShell";
import { Modal } from "../features/layout/Modal";
import { Workspace } from "../features/layout/Workspace";
import { layoutStore } from "../features/layout/layoutStore";
import { QuickConnectDialog } from "../features/quick-connect/QuickConnectDialog";
import type { QuickConnectProfile } from "../features/quick-connect/searchIndex";
import { SerialProfileForm, type SerialProfileFormValue } from "../features/serial/SerialProfileForm";
import { sessionRecoveryStore } from "../features/sessions/sessionRecoveryStore";
import { Sidebar } from "../features/sidebar/Sidebar";
import type { SerialProfileRecord } from "@sshterm/shared";

async function loadHosts(): Promise<HostRecord[]> {
  if (!window.sshterm?.listHosts) {
    console.warn("[sshterm] listHosts not available on window.sshterm");
    return [];
  }
  try {
    const dbHosts = await window.sshterm.listHosts();
    console.log("[sshterm] loaded hosts from DB:", dbHosts.length);
    return dbHosts.map((h: Record<string, unknown>) => ({
      id: String(h.id ?? ""),
      name: String(h.name ?? ""),
      hostname: String(h.hostname ?? ""),
      port: Number(h.port ?? 22),
      username: String(h.username ?? ""),
      group: "",
      tags: "",
      notes: h.notes ? String(h.notes) : undefined
    }));
  } catch (err) {
    console.error("[sshterm] failed to load hosts:", err);
    return [];
  }
}

async function loadSerialProfiles(): Promise<SerialProfileRecord[]> {
  if (!window.sshterm?.listSerialProfiles) {
    return [];
  }
  try {
    return await window.sshterm.listSerialProfiles();
  } catch (err) {
    console.error("[sshterm] failed to load serial profiles:", err);
    return [];
  }
}

async function persistSerialProfile(profile: SerialProfileRecord): Promise<void> {
  if (!window.sshterm?.upsertSerialProfile) return;
  try {
    await window.sshterm.upsertSerialProfile(profile);
  } catch (err) {
    console.error("[sshterm] failed to persist serial profile:", err);
  }
}

async function persistHost(host: HostRecord): Promise<void> {
  if (!window.sshterm?.upsertHost) {
    console.warn("[sshterm] upsertHost not available");
    return;
  }
  try {
    const result = await window.sshterm.upsertHost({
      id: host.id,
      name: host.name,
      hostname: host.hostname,
      port: host.port,
      username: host.username || null,
      group: host.group,
      tags: host.tags,
      notes: host.notes || null
    });
    console.log("[sshterm] persisted host:", result);
  } catch (err) {
    console.error("[sshterm] failed to persist host:", err);
  }
}

function toSerialFormInitialValue(
  profile: SerialProfileRecord | null
): Partial<SerialProfileFormValue> | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    name: profile.name,
    path: profile.path,
    baudRate: profile.baudRate,
    dataBits: profile.dataBits as 5 | 6 | 7 | 8,
    stopBits: profile.stopBits as 1 | 2,
    parity: profile.parity,
    flowControl: profile.flowControl,
    localEcho: profile.localEcho,
    dtr: profile.dtr,
    rts: profile.rts
  };
}

export function App() {
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null);
  const [serialProfiles, setSerialProfiles] = useState<SerialProfileRecord[]>([]);
  const [serialModalOpen, setSerialModalOpen] = useState(false);
  const [editingSerial, setEditingSerial] = useState<SerialProfileRecord | null>(null);
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);
  const [sftpAuthModalOpen, setSftpAuthModalOpen] = useState(false);
  const [sftpAuthHost, setSftpAuthHost] = useState<HostRecord | null>(null);
  const [sftpAuthUsername, setSftpAuthUsername] = useState("");
  const [sftpAuthPassword, setSftpAuthPassword] = useState("");
  const [sftpAuthError, setSftpAuthError] = useState<string | null>(null);
  const [sftpAuthSubmitting, setSftpAuthSubmitting] = useState(false);

  const openTab = useStore(layoutStore, (s) => s.openTab);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const broadcastEnabled = useStore(broadcastStore, (s) => s.enabled);
  const broadcastTargets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggleBroadcast = useStore(broadcastStore, (s) => s.toggle);
  const setBroadcastTargets = useStore(broadcastStore, (s) => s.setTargets);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

  useEffect(() => {
    void Promise.all([loadHosts(), loadSerialProfiles()]).then(
      ([h, sp]) => { setHosts(h); setSerialProfiles(sp); }
    );
  }, []);

  const tabSessionIds = useMemo(() => tabs.map((t) => t.sessionId), [tabs]);

  useEffect(() => {
    for (const id of tabSessionIds) {
      rememberSession(id);
    }
    setBroadcastTargets(tabSessionIds);
  }, [rememberSession, setBroadcastTargets, tabSessionIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsQuickConnectOpen(true);
      }
      if (e.key.toLowerCase() === "b" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleBroadcast();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleBroadcast]);

  useEffect(() => {
    return window.sshterm?.onQuickConnect?.(() => {
      setIsQuickConnectOpen(true);
    });
  }, []);

  const refreshPorts = useCallback(() => {
    window.sshterm?.listSerialPorts?.()
      .then(ports => setAvailablePorts(ports.map(p => p.path)))
      .catch(console.error);
  }, []);

  const connectSerial = useCallback(
    (profile: SerialProfileRecord) => {
      const sessionId = `serial-${profile.id}-${Date.now()}`;
      openTab({
        tabKey: sessionId,
        sessionId,
        title: profile.name,
        transport: "serial",
        profileId: profile.id,
        preopened: false
      });
    },
    [openTab]
  );

  const connectHost = useCallback(
    (host: HostRecord) => {
      const optimisticSessionId = `ssh-${host.id}-${Date.now()}`;
      const destination = host.username
        ? `${host.username}@${host.hostname}`
        : host.hostname;
      openTab({
        tabKey: optimisticSessionId,
        sessionId: optimisticSessionId,
        title: host.name,
        transport: "ssh",
        profileId: destination,
        preopened: false
      });
    },
    [openTab]
  );

  const openSftpTab = useCallback(
    (host: HostRecord, sftpSessionId: string) => {
      const tabSessionId = `sftp-tab-${sftpSessionId}`;
      openTab({
        tabKey: tabSessionId,
        sessionId: tabSessionId,
        title: `SFTP: ${host.name}`,
        transport: "sftp",
        type: "sftp",
        sftpSessionId,
        hostId: host.id,
        preopened: true
      });
    },
    [openTab]
  );

  const closeSftpAuthModal = useCallback(() => {
    setSftpAuthModalOpen(false);
    setSftpAuthHost(null);
    setSftpAuthPassword("");
    setSftpAuthError(null);
    setSftpAuthSubmitting(false);
  }, []);

  const openSftpAuthModal = useCallback(
    (host: HostRecord, errorMessage?: string) => {
      setSftpAuthHost(host);
      setSftpAuthUsername(host.username?.trim() ?? "");
      setSftpAuthPassword("");
      setSftpAuthError(errorMessage ?? null);
      setSftpAuthModalOpen(true);
    },
    []
  );

  const connectSftpWithPassword = useCallback(async () => {
    if (!window.sshterm?.sftpConnect || !sftpAuthHost) {
      return;
    }

    const username = sftpAuthUsername.trim();
    if (!username || !sftpAuthPassword) {
      setSftpAuthError("Username and password are required.");
      return;
    }

    setSftpAuthSubmitting(true);
    setSftpAuthError(null);
    try {
      const { sftpSessionId } = await window.sshterm.sftpConnect({
        hostId: sftpAuthHost.id,
        username,
        password: sftpAuthPassword
      });
      openSftpTab(sftpAuthHost, sftpSessionId);
      closeSftpAuthModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSftpAuthError(message);
    } finally {
      setSftpAuthSubmitting(false);
    }
  }, [
    closeSftpAuthModal,
    openSftpTab,
    sftpAuthHost,
    sftpAuthPassword,
    sftpAuthUsername
  ]);

  const openSftpHost = useCallback(
    async (host: HostRecord) => {
      if (!window.sshterm?.sftpConnect) {
        return;
      }

      try {
        const { sftpSessionId } = await window.sshterm.sftpConnect({
          hostId: host.id
        });
        openSftpTab(host, sftpSessionId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const lowerMessage = message.toLowerCase();
        const shouldPromptForPassword =
          lowerMessage.includes("authentication methods failed") ||
          lowerMessage.includes("failed to connect to agent") ||
          lowerMessage.includes("failed to retrieve identities from agent") ||
          lowerMessage.includes("auth unavailable");

        if (!shouldPromptForPassword) {
          console.error("[sshterm] failed to open SFTP tab:", error);
          return;
        }
        openSftpAuthModal(host, message);
      }
    },
    [openSftpAuthModal, openSftpTab]
  );

  const profiles = useMemo<QuickConnectProfile[]>(
    () => [
      ...hosts.map((h) => ({
        id: h.id,
        label: h.name,
        hostname: h.hostname,
        transport: "ssh" as const,
        group: h.group,
        tags: h.tags?.split(",").map((t) => t.trim()) ?? []
      })),
      ...serialProfiles.map((sp) => ({
        id: sp.id,
        label: sp.name,
        hostname: sp.path,
        transport: "serial" as const,
        description: `${sp.baudRate} baud`
      }))
    ],
    [hosts, serialProfiles]
  );

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            hosts={hosts}
            onConnectHost={connectHost}
            onOpenSftpHost={openSftpHost}
            onEditHost={(host) => { setEditingHost(host); setHostModalOpen(true); }}
            onNewHost={() => { setEditingHost(null); setHostModalOpen(true); }}
            onImportSshConfig={() => setImportModalOpen(true)}
            serialProfiles={serialProfiles}
            onConnectSerial={connectSerial}
            onEditSerial={(profile) => { setEditingSerial(profile); setSerialModalOpen(true); }}
            onNewSerial={() => { setEditingSerial(null); setSerialModalOpen(true); refreshPorts(); }}
          />
        }
      >
        {broadcastEnabled && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-yellow-900/50 bg-yellow-950/30 text-yellow-300 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Broadcast mode active &mdash; {broadcastTargets.length} session
            {broadcastTargets.length === 1 ? "" : "s"}
          </div>
        )}

        <Workspace />
      </AppShell>

      <QuickConnectDialog
        open={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        profiles={profiles}
        onOpenProfile={(profile) => {
          if (profile.transport === "serial") {
            const sp = serialProfiles.find((s) => s.id === profile.id);
            if (sp) connectSerial(sp);
          } else {
            const host = hosts.find((h) => h.id === profile.id);
            if (host) connectHost(host);
          }
        }}
      />

      <Modal
        open={hostModalOpen}
        onClose={() => setHostModalOpen(false)}
        title={editingHost ? `Edit ${editingHost.name}` : "New Host"}
      >
        <HostForm
          key={editingHost?.id ?? "new"}
          initialValue={editingHost ?? undefined}
          submitLabel={editingHost ? "Update host" : "Add host"}
          onSubmit={(value: HostFormValue) => {
            const id = editingHost?.id ?? `host-${Date.now()}`;
            const isDuplicate = !editingHost && hosts.some(
              (h) => h.name === value.name || (h.hostname === value.hostname && h.port === value.port)
            );
            if (isDuplicate) {
              setHostModalOpen(false);
              return;
            }
            const record: HostRecord = { id, ...value };
            if (editingHost) {
              setHosts((prev) =>
                prev.map((h) => (h.id === id ? record : h))
              );
            } else {
              setHosts((prev) => [...prev, record]);
            }
            void persistHost(record);
            setHostModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import SSH Config"
      >
        <SshConfigImportDialog
          onImport={(items: SshConfigImportItem[]) => {
            const newHosts = items.map((item, i) => ({
              id: `imported-${Date.now()}-${i}`,
              name: item.alias,
              hostname: item.hostName ?? item.alias,
              port: item.port ?? 22,
              username: item.user ?? "",
              group: "Imported",
              tags: "ssh-config"
            }));
            setHosts((prev) => [...prev, ...newHosts]);
            for (const host of newHosts) {
              void persistHost(host);
            }
            setImportModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={serialModalOpen}
        onClose={() => setSerialModalOpen(false)}
        title={editingSerial ? `Edit ${editingSerial.name}` : "New Serial Profile"}
      >
        <SerialProfileForm
          key={editingSerial?.id ?? "new-serial"}
          initialValue={toSerialFormInitialValue(editingSerial)}
          submitLabel={editingSerial ? "Update profile" : "Add profile"}
          availablePorts={availablePorts}
          onRefreshPorts={refreshPorts}
          onSubmit={(value: SerialProfileFormValue) => {
            const id = editingSerial?.id ?? `serial-${Date.now()}`;
            const record: SerialProfileRecord = {
              id,
              ...value,
              notes: null
            };
            if (editingSerial) {
              setSerialProfiles((prev) =>
                prev.map((p) => (p.id === id ? record : p))
              );
            } else {
              setSerialProfiles((prev) => [...prev, record]);
            }
            void persistSerialProfile(record);
            setSerialModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        open={sftpAuthModalOpen}
        onClose={closeSftpAuthModal}
        title={sftpAuthHost ? `SFTP Credentials: ${sftpAuthHost.name}` : "SFTP Credentials"}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void connectSftpWithPassword();
          }}
        >
          {sftpAuthHost ? (
            <p className="text-xs text-text-muted">
              Connect to `{sftpAuthHost.hostname}:{sftpAuthHost.port}`
            </p>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Username</span>
            <input
              value={sftpAuthUsername}
              onChange={(event) => setSftpAuthUsername(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
              autoComplete="username"
              disabled={sftpAuthSubmitting}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Password</span>
            <input
              type="password"
              value={sftpAuthPassword}
              onChange={(event) => setSftpAuthPassword(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright"
              autoComplete="current-password"
              disabled={sftpAuthSubmitting}
            />
          </label>

          {sftpAuthError ? (
            <p className="text-xs text-danger">{sftpAuthError}</p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-base-700/60 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
              onClick={closeSftpAuthModal}
              disabled={sftpAuthSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 disabled:opacity-60"
              disabled={sftpAuthSubmitting}
            >
              {sftpAuthSubmitting ? "Connecting..." : "Connect SFTP"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
