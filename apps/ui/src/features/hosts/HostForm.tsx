import { useEffect, useId, useMemo, useState } from "react";

// --- Validation helpers ---

const hostnameRegex =
  /^(?:localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;

const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?$/;

function isValidHostname(value: string): boolean {
  if (!value.trim()) return false;
  const v = value.trim();
  return hostnameRegex.test(v) || ipv4Regex.test(v) || ipv6Regex.test(v);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isIdentityFilePathSuspicious(path: string): string | null {
  if (!path) return null; // empty = "Auto-detect", fine
  const trimmed = path.trim();
  if (!trimmed) return "Selected key path is empty.";
  // Warn if path doesn't look like a typical key file
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(trimmed);
  const inSshDir = /[\\/]\.ssh[\\/]/.test(trimmed);
  if (!hasExtension && !inSshDir) {
    return "Path does not appear to be in a .ssh directory or have a file extension.";
  }
  return null;
}

export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  identityFile: string;
  group: string;
  tags: string;
  authMethod: "default" | "password" | "keyfile" | "agent" | "op-reference";
  agentKind: "system" | "pageant" | "1password";
  opReference: string;
  color?: string | null;
};

export interface HostFormProps {
  initialValue?: Partial<HostFormValue>;
  submitLabel?: string;
  onSubmit: (value: HostFormValue) => void;
}

const defaultValue: HostFormValue = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
  identityFile: "",
  group: "",
  tags: "",
  authMethod: "default",
  agentKind: "system",
  opReference: ""
};

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

export function HostForm({
  initialValue,
  submitLabel = "Save host",
  onSubmit
}: HostFormProps) {
  const formId = useId();
  const [value, setValue] = useState<HostFormValue>({
    ...defaultValue,
    ...initialValue
  });
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {};
    e.hostname = value.hostname && !isValidHostname(value.hostname)
      ? "Enter a valid DNS name, IPv4, IPv6, or \"localhost\"."
      : !value.hostname
        ? "Hostname is required."
        : null;
    e.port = !isValidPort(value.port)
      ? "Port must be between 1 and 65535."
      : null;
    return e;
  }, [value.hostname, value.port]);

  const identityWarning = useMemo(
    () => isIdentityFilePathSuspicious(value.identityFile),
    [value.identityFile]
  );

  const hasErrors = Object.values(errors).some(Boolean);

  useEffect(() => {
    setValue({ ...defaultValue, ...initialValue });
  }, [initialValue]);

  useEffect(() => {
    async function loadKeys() {
      try {
        const keys = await window.sshterm?.fsListSshKeys?.();
        if (keys?.length) setSshKeys(keys);
      } catch { /* ignore */ }
    }
    void loadKeys();
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-5"
    >
      <label htmlFor={`${formId}-name`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Name</span>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          className={inputClasses}
        />
      </label>

      <label htmlFor={`${formId}-hostname`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Hostname</span>
        <input
          id={`${formId}-hostname`}
          value={value.hostname}
          onChange={(e) => setValue({ ...value, hostname: e.target.value })}
          onBlur={() => setTouched((t) => ({ ...t, hostname: true }))}
          placeholder="web-01.example.com"
          className={inputClasses}
        />
        {touched.hostname && errors.hostname && (
          <span className="text-xs text-red-400">{errors.hostname}</span>
        )}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-port`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Port</span>
          <input
            id={`${formId}-port`}
            type="number"
            min={1}
            max={65535}
            value={value.port}
            onChange={(e) => setValue({ ...value, port: Number(e.target.value) || 22 })}
            onBlur={() => setTouched((t) => ({ ...t, port: true }))}
            className={inputClasses}
          />
          {touched.port && errors.port && (
            <span className="text-xs text-red-400">{errors.port}</span>
          )}
        </label>
        <label htmlFor={`${formId}-username`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Username</span>
          <input
            id={`${formId}-username`}
            value={value.username}
            onChange={(e) => setValue({ ...value, username: e.target.value })}
            className={inputClasses}
          />
        </label>
      </div>

      <label htmlFor={`${formId}-identityFile`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">SSH Key</span>
        <select
          id={`${formId}-identityFile`}
          value={value.identityFile}
          onChange={(e) => setValue({ ...value, identityFile: e.target.value })}
          className={inputClasses}
        >
          <option value="">Auto-detect</option>
          {sshKeys.map((key) => (
            <option key={key} value={key}>
              {key.replace(/^.*[\\/]\.ssh[\\/]/, "")}
            </option>
          ))}
          {value.identityFile && !sshKeys.includes(value.identityFile) && (
            <option value={value.identityFile}>
              {value.identityFile.replace(/^.*[\\/]\.ssh[\\/]/, "")}
            </option>
          )}
        </select>
        {identityWarning && (
          <span className="text-xs text-amber-400">{identityWarning}</span>
        )}
      </label>

      <div className="grid gap-3">
        <span className="text-xs font-medium text-text-secondary">Authentication</span>

        <label htmlFor={`${formId}-authMethod`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Method</span>
          <select
            id={`${formId}-authMethod`}
            value={value.authMethod}
            onChange={(e) =>
              setValue({
                ...value,
                authMethod: e.target.value as HostFormValue["authMethod"]
              })
            }
            className={inputClasses}
          >
            <option value="default">Default (SSH config)</option>
            <option value="keyfile">Key File</option>
            <option value="agent">SSH Agent</option>
            <option value="op-reference">1Password Reference</option>
          </select>
        </label>

        {value.authMethod === "agent" && (
          <label htmlFor={`${formId}-agentKind`} className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Agent Type</span>
            <select
              id={`${formId}-agentKind`}
              value={value.agentKind}
              onChange={(e) =>
                setValue({
                  ...value,
                  agentKind: e.target.value as HostFormValue["agentKind"]
                })
              }
              className={inputClasses}
            >
              <option value="system">System SSH Agent</option>
              <option value="pageant">Pageant</option>
              <option value="1password">1Password SSH Agent</option>
            </select>
          </label>
        )}

        {value.authMethod === "op-reference" && (
          <label htmlFor={`${formId}-opReference`} className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">1Password Reference</span>
            <input
              id={`${formId}-opReference`}
              value={value.opReference}
              onChange={(e) => setValue({ ...value, opReference: e.target.value })}
              placeholder="op://vault/item/field"
              className={inputClasses}
            />
            <span className="text-xs text-text-muted/70">
              Enter an <code>op://</code> reference to a credential stored in 1Password.
            </span>
          </label>
        )}
      </div>

      <label htmlFor={`${formId}-group`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Group</span>
        <input
          id={`${formId}-group`}
          value={value.group}
          onChange={(e) => setValue({ ...value, group: e.target.value })}
          className={inputClasses}
        />
      </label>

      <label htmlFor={`${formId}-tags`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Tags</span>
        <input
          id={`${formId}-tags`}
          value={value.tags}
          onChange={(e) => setValue({ ...value, tags: e.target.value })}
          placeholder="prod, linux, db"
          className={inputClasses}
        />
      </label>

      <button
        type="submit"
        disabled={hasErrors}
        className={`justify-self-start rounded-lg px-5 py-2 text-sm font-medium transition-all duration-150 ${
          hasErrors
            ? "bg-surface/50 border border-border text-text-muted cursor-not-allowed"
            : "bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 hover:border-accent/40 active:bg-accent/30"
        }`}
      >
        {submitLabel}
      </button>
    </form>
  );
}
