import { useMemo, useState } from "react";
import { toast } from "sonner";

import { HostForm, type HostFormValue } from "./HostForm";
import {
  SshConfigImportDialog,
  type SshConfigImportItem
} from "./SshConfigImportDialog";

export type HostRecord = HostFormValue & {
  id: string;
  notes?: string;
  isFavorite?: boolean;
  sortOrder?: number | null;
  color?: string | null;
};

const demoHosts: HostRecord[] = [
  {
    id: "host-1",
    name: "web-01",
    hostname: "web-01.example.com",
    port: 22,
    username: "admin",
    identityFile: "",
    envVars: [],
    group: "Production",
    tags: "web,linux,prod",
    tagIds: [],
    authMethod: "default",
    agentKind: "system",
    opReference: "",
    proxyJump: "",
    proxyJumpHostIds: "",
    keepAliveInterval: "",
    autoReconnect: false,
    reconnectMaxAttempts: 5,
    reconnectBaseInterval: 1,
    notes: "Primary web server"
  },
  {
    id: "host-2",
    name: "bastion",
    hostname: "bastion.example.com",
    port: 22,
    username: "ops",
    identityFile: "",
    envVars: [],
    group: "Infrastructure",
    tags: "jump,prod",
    tagIds: [],
    authMethod: "default",
    agentKind: "system",
    opReference: "",
    proxyJump: "",
    proxyJumpHostIds: "",
    keepAliveInterval: "",
    autoReconnect: false,
    reconnectMaxAttempts: 5,
    reconnectBaseInterval: 1,
    notes: "Use for multi-hop access"
  }
];

export function HostsView() {
  const [hosts, setHosts] = useState<HostRecord[]>(demoHosts);
  const [selectedId, setSelectedId] = useState<string>(demoHosts[0]?.id ?? "");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const handleExport = async (format: "json" | "csv") => {
    const ext = format === "json" ? "json" : "csv";
    const filePath = await window.sshterm?.fsShowSaveDialog?.({
      defaultPath: `hosts.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (!filePath) return;
    try {
      const result = await window.sshterm?.exportHosts?.({ format, filePath });
      if (result) {
        toast.success(`Exported ${result.exported} hosts to ${filePath}`);
      }
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const selectedHost = useMemo(
    () => hosts.find((host) => host.id === selectedId) ?? null,
    [hosts, selectedId]
  );

  return (
    <section
      style={{
        display: "grid",
        gap: 16,
        padding: 16,
        borderRadius: 16,
        border: "1px solid rgba(148, 163, 184, 0.2)",
        background: "rgba(15, 23, 42, 0.92)"
      }}
    >
      <header>
        <h2 style={{ margin: 0, fontSize: 18, color: "#e2e8f0" }}>Hosts</h2>
        <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>
          Manage SSH endpoints and organize them with groups and tags.
        </p>
        <button
          onClick={() => setSelectedId("")}
          style={{
            marginTop: 12,
            borderRadius: 10,
            border: "1px solid rgba(125, 211, 252, 0.3)",
            background: "rgba(8, 47, 73, 0.72)",
            color: "#e0f2fe",
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          New host
        </button>
        <button
          onClick={() => setIsImportOpen((current) => !current)}
          style={{
            marginTop: 12,
            marginLeft: 8,
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "rgba(30, 41, 59, 0.72)",
            color: "#cbd5e1",
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Import SSH Config
        </button>
        <button
          onClick={() => handleExport("json")}
          style={{
            marginTop: 12,
            marginLeft: 8,
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "rgba(30, 41, 59, 0.72)",
            color: "#cbd5e1",
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Export JSON
        </button>
        <button
          onClick={() => handleExport("csv")}
          style={{
            marginTop: 12,
            marginLeft: 8,
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "rgba(30, 41, 59, 0.72)",
            color: "#cbd5e1",
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Export CSV
        </button>
      </header>

      {isImportOpen ? (
        <SshConfigImportDialog
          onImport={(items: SshConfigImportItem[]) => {
            setHosts((currentHosts) => {
              const importedHosts: HostRecord[] = items.map((item, index) => ({
                id: `imported-${currentHosts.length + index + 1}`,
                name: item.alias,
                hostname: item.hostName ?? item.alias,
                port: item.port ?? 22,
                username: item.user ?? "",
                identityFile: "",
                envVars: [],
                group: "Imported",
                tags: "ssh-config",
                tagIds: [],
                authMethod: "default",
                agentKind: "system",
                opReference: "",
                proxyJump: "",
                proxyJumpHostIds: "",
                keepAliveInterval: "",
                autoReconnect: false,
                reconnectMaxAttempts: 5,
                reconnectBaseInterval: 1,
              }));

              return [...currentHosts, ...importedHosts];
            });
            setIsImportOpen(false);
          }}
        />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 12 }}>
          {hosts.map((host) => (
            <button
              key={host.id}
              onClick={() => setSelectedId(host.id)}
              style={{
                textAlign: "left",
                borderRadius: 14,
                border:
                  host.id === selectedId
                    ? "1px solid rgba(125, 211, 252, 0.45)"
                    : "1px solid rgba(148, 163, 184, 0.14)",
                background:
                  host.id === selectedId
                    ? "rgba(8, 47, 73, 0.7)"
                    : "rgba(2, 6, 23, 0.6)",
                color: "#e2e8f0",
                padding: 14,
                cursor: "pointer"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{host.name}</strong>
                <span style={{ color: "#94a3b8" }}>
                  {host.hostname}:{host.port}
                </span>
              </div>
              <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 13 }}>
                {host.group} {host.tags ? `• ${host.tags}` : ""}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <HostForm
            key={selectedHost?.id ?? "new"}
            initialValue={selectedHost ?? undefined}
            submitLabel={selectedHost ? "Update host" : "Add host"}
            onSubmit={(value) => {
              const nextId = selectedHost?.id ?? `host-${hosts.length + 1}`;
              const nextHost: HostRecord = {
                id: nextId,
                ...value
              };

              setHosts((currentHosts) => {
                const index = currentHosts.findIndex((host) => host.id === nextId);
                if (index === -1) {
                  return [...currentHosts, nextHost];
                }

                const copy = currentHosts.slice();
                copy[index] = nextHost;
                return copy;
              });
              setSelectedId(nextId);
            }}
          />

          {selectedHost ? (
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(148, 163, 184, 0.14)",
                background: "rgba(2, 6, 23, 0.7)",
                padding: 14,
                color: "#cbd5e1"
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Notes</div>
              <div style={{ color: "#94a3b8" }}>{selectedHost.notes ?? "No notes"}</div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
