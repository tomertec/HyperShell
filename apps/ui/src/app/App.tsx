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
import { sessionRecoveryStore } from "../features/sessions/sessionRecoveryStore";
import { Sidebar } from "../features/sidebar/Sidebar";

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

export function App() {
  const [hosts, setHosts] = useState<HostRecord[]>([]);
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null);

  const openTab = useStore(layoutStore, (s) => s.openTab);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const broadcastEnabled = useStore(broadcastStore, (s) => s.enabled);
  const broadcastTargets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggleBroadcast = useStore(broadcastStore, (s) => s.toggle);
  const setBroadcastTargets = useStore(broadcastStore, (s) => s.setTargets);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

  // Load hosts from DB on mount
  useEffect(() => {
    void loadHosts().then(setHosts);
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

  const profiles = useMemo<QuickConnectProfile[]>(
    () =>
      hosts.map((h) => ({
        id: h.id,
        label: h.name,
        hostname: h.hostname,
        transport: "ssh" as const,
        group: h.group,
        tags: h.tags?.split(",").map((t) => t.trim()) ?? []
      })),
    [hosts]
  );

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            hosts={hosts}
            onConnectHost={connectHost}
            onEditHost={(host) => {
              setEditingHost(host);
              setHostModalOpen(true);
            }}
            onNewHost={() => {
              setEditingHost(null);
              setHostModalOpen(true);
            }}
            onImportSshConfig={() => setImportModalOpen(true)}
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
          const host = hosts.find((h) => h.id === profile.id);
          if (host) connectHost(host);
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
    </>
  );
}
