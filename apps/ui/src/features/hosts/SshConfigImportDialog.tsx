import { useMemo, useState } from "react";

export type SshConfigImportItem = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
};

export interface SshConfigImportDialogProps {
  initialValue?: string;
  onImport: (items: SshConfigImportItem[]) => void;
}

function previewSshConfig(input: string): SshConfigImportItem[] {
  const items: SshConfigImportItem[] = [];
  let current: SshConfigImportItem | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [directive, ...rest] = line.split(/\s+/);
    const value = rest.join(" ").trim();
    const lower = directive.toLowerCase();

    if (lower === "host") {
      const aliases = value
        .split(/\s+/)
        .map((alias) => alias.trim())
        .filter(Boolean)
        .filter((alias) => alias !== "*");

      if (aliases.length === 0) {
        current = null;
        continue;
      }

      current = { alias: aliases[0] };
      items.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    if (lower === "hostname") {
      current.hostName = value;
    } else if (lower === "user") {
      current.user = value;
    } else if (lower === "port") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        current.port = parsed;
      }
    }
  }

  return items;
}

export function SshConfigImportDialog({
  initialValue = "",
  onImport
}: SshConfigImportDialogProps) {
  const [value, setValue] = useState(initialValue);
  const preview = useMemo(() => previewSshConfig(value), [value]);

  return (
    <div className="grid gap-4">
      <p className="text-xs text-text-secondary">
        Paste ~/.ssh/config content to preview imported hosts.
      </p>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder={`Host web\n  HostName web-01.example.com\n  User admin`}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-dim resize-y"
      />

      <div className="grid gap-1.5">
        {preview.map((item) => (
          <div
            key={item.alias}
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-base-900 text-sm"
          >
            <span className="font-medium text-text-primary">{item.alias}</span>
            <span className="text-text-muted text-xs">
              {item.user ?? "no user"} {item.hostName ? `\u00b7 ${item.hostName}` : ""}{" "}
              {item.port ? `\u00b7 ${item.port}` : ""}
            </span>
          </div>
        ))}
        {preview.length === 0 && (
          <div className="text-xs text-text-muted py-2">No hosts found in the pasted config.</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onImport(preview)}
        className="justify-self-start rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
      >
        Import {preview.length} host{preview.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
