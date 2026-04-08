import type { HostRecord } from "@sshterm/db";

const CSV_FIELDS = [
  "name", "hostname", "port", "username", "identityFile",
  "groupId", "notes", "authMethod", "agentKind",
  "proxyJump", "keepAliveInterval", "autoReconnect",
] as const;

function escapeCsv(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function quoteSshValue(value: string): string {
  if (!/\s/.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function toHostAlias(host: HostRecord): string {
  const source = host.name.trim() || host.hostname.trim();
  if (!source) {
    return "host";
  }
  return source.replace(/\s+/g, "-");
}

export function exportHostsToJson(hosts: HostRecord[]): string {
  return JSON.stringify(hosts, null, 2);
}

export function exportHostsToCsv(hosts: HostRecord[]): string {
  const header = CSV_FIELDS.join(",");
  const rows = hosts.map((host) =>
    CSV_FIELDS.map((field) => escapeCsv(host[field as keyof HostRecord])).join(",")
  );
  return [header, ...rows].join("\n");
}

export function exportHostsToSshConfig(hosts: HostRecord[]): string {
  const blocks = hosts.map((host) => {
    const lines = [
      `Host ${quoteSshValue(toHostAlias(host))}`,
      `  HostName ${quoteSshValue(host.hostname)}`
    ];

    if (host.port) {
      lines.push(`  Port ${host.port}`);
    }
    if (host.username) {
      lines.push(`  User ${quoteSshValue(host.username)}`);
    }
    if (host.identityFile) {
      lines.push(`  IdentityFile ${quoteSshValue(host.identityFile)}`);
    }
    if (host.proxyJump) {
      lines.push(`  ProxyJump ${quoteSshValue(host.proxyJump)}`);
    }
    if (host.keepAliveInterval && host.keepAliveInterval > 0) {
      lines.push(`  ServerAliveInterval ${host.keepAliveInterval}`);
    }
    return lines.join("\n");
  });

  return `${blocks.join("\n\n")}\n`;
}
