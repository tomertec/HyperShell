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
    tmuxDetect: false,
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
    tmuxDetect: false,
    notes: "Use for multi-hop access"
  }
];

export function HostsView() {
  const [hosts, setHosts] = useState<HostRecord[]>(demoHosts);
  const [selectedId, setSelectedId] = useState<string>(demoHosts[0]?.id ?? "");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const handleExport = async (format: "json" | "csv") => {
    const ext = format === "json" ? "json" : "csv";
    const filePath = await window.hypershell?.fsShowSaveDialog?.({
      defaultPath: `hosts.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (!filePath) return;
    try {
      const result = await window.hypershell?.exportHosts?.({ format, filePath });
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
      className="grid gap-4 p-4 rounded-2xl border border-border bg-base-800/95"
    >
      <header>
        <h2 className="m-0 text-lg text-text-primary">Hosts</h2>
        <p className="mt-1.5 text-text-secondary">
          Manage SSH endpoints and organize them with groups and tags.
        </p>
        <button
          onClick={() => setSelectedId("")}
          className="mt-3 rounded-[10px] border border-accent-dim bg-accent/15 text-accent px-3 py-2 cursor-pointer"
        >
          New host
        </button>
        <button
          onClick={() => setIsImportOpen((current) => !current)}
          className="mt-3 ml-2 rounded-[10px] border border-border-bright bg-base-700/70 text-text-secondary px-3 py-2 cursor-pointer"
        >
          Import SSH Config
        </button>
        <button
          onClick={() => handleExport("json")}
          className="mt-3 ml-2 rounded-[10px] border border-border-bright bg-base-700/70 text-text-secondary px-3 py-2 cursor-pointer"
        >
          Export JSON
        </button>
        <button
          onClick={() => handleExport("csv")}
          className="mt-3 ml-2 rounded-[10px] border border-border-bright bg-base-700/70 text-text-secondary px-3 py-2 cursor-pointer"
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
                tmuxDetect: false,
              }));

              return [...currentHosts, ...importedHosts];
            });
            setIsImportOpen(false);
          }}
        />
      ) : null}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
        <div className="grid gap-3">
          {hosts.map((host) => (
            <button
              key={host.id}
              onClick={() => setSelectedId(host.id)}
              className={`text-left rounded-[14px] border p-3.5 cursor-pointer text-text-primary ${
                host.id === selectedId
                  ? "border-accent/45 bg-accent/15"
                  : "border-border bg-base-950/60"
              }`}
            >
              <div className="flex justify-between gap-3">
                <strong>{host.name}</strong>
                <span className="text-text-secondary">
                  {host.hostname}:{host.port}
                </span>
              </div>
              <div className="mt-1.5 text-text-secondary text-[13px]">
                {host.group} {host.tags ? `• ${host.tags}` : ""}
              </div>
            </button>
          ))}
        </div>

        <div className="grid gap-3">
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
              className="rounded-[14px] border border-border bg-base-950/70 p-3.5 text-text-secondary"
            >
              <div className="font-semibold mb-1.5">Notes</div>
              <div className="text-text-secondary">{selectedHost.notes ?? "No notes"}</div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
