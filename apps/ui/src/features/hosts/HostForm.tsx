import { useEffect, useId, useMemo, useState } from "react";
import { HostPortForwardList } from "./HostPortForwardList";
import { OpPickerModal } from "./OpPickerModal";
import { inputClasses } from "../../lib/formStyles";

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
  proxyJump: string;
  proxyJumpHostIds: string;
  keepAliveInterval: string;  // text input, empty = default
  autoReconnect: boolean;
  reconnectMaxAttempts: number;
  reconnectBaseInterval: number;
  password?: string;
  savePassword?: boolean;
  clearSavedPassword?: boolean;
  hasSavedPassword?: boolean;
  passwordSavedAt?: string | null;
};

export interface HostFormProps {
  hostId?: string;  // set when editing existing host
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
  opReference: "",
  proxyJump: "",
  proxyJumpHostIds: "",
  keepAliveInterval: "",
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1,
  password: "",
  savePassword: true,
  clearSavedPassword: false,
  hasSavedPassword: false,
  passwordSavedAt: null,
};

function buildInitialValue(initialValue?: Partial<HostFormValue>): HostFormValue {
  const hasSavedPassword = Boolean(initialValue?.hasSavedPassword);
  return {
    ...defaultValue,
    ...initialValue,
    // Never prefill password input from persisted state.
    password: "",
    savePassword:
      initialValue?.savePassword !== undefined
        ? initialValue.savePassword
        : !hasSavedPassword,
    clearSavedPassword: false,
    hasSavedPassword
  };
}

export function HostForm({
  hostId,
  initialValue,
  submitLabel = "Save host",
  onSubmit
}: HostFormProps) {
  const formId = useId();
  const [value, setValue] = useState<HostFormValue>(buildInitialValue(initialValue));
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [opPickerOpen, setOpPickerOpen] = useState(false);

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
    e.password =
      value.authMethod === "password" &&
      value.savePassword &&
      !(value.password ?? "").trim()
        ? "Password is required when saving credentials."
        : null;
    return e;
  }, [value.authMethod, value.hostname, value.password, value.port, value.savePassword]);

  const identityWarning = useMemo(
    () => isIdentityFilePathSuspicious(value.identityFile),
    [value.identityFile]
  );

  const hasErrors = Object.values(errors).some(Boolean);
  const passwordSavedLabel = useMemo(() => {
    if (!value.passwordSavedAt) {
      return null;
    }
    const parsed = new Date(value.passwordSavedAt);
    if (Number.isNaN(parsed.getTime())) {
      return "Saved";
    }
    return `Saved ${new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed)}`;
  }, [value.passwordSavedAt]);

  useEffect(() => {
    setValue(buildInitialValue(initialValue));
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
            onChange={(e) => {
              const nextMethod = e.target.value as HostFormValue["authMethod"];
              if (nextMethod === "password") {
                setValue({
                  ...value,
                  authMethod: nextMethod,
                  savePassword: value.hasSavedPassword ? false : true,
                  clearSavedPassword: false,
                  password: ""
                });
                return;
              }

              setValue({
                ...value,
                authMethod: nextMethod,
                savePassword: false,
                clearSavedPassword: false,
                password: ""
              });
            }}
            className={inputClasses}
          >
            <option value="default">Default (SSH config)</option>
            <option value="password">Password</option>
            <option value="keyfile">Key File</option>
            <option value="agent">SSH Agent</option>
            <option value="op-reference">1Password Reference</option>
          </select>
        </label>

        {value.authMethod === "password" && (
          <div className="grid gap-2">
            {value.hasSavedPassword && !value.clearSavedPassword && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  {passwordSavedLabel ?? "Password saved securely"}
                </span>
                <span className="text-xs text-text-muted/70">
                  A password is already saved for this host.
                </span>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value.savePassword}
                onChange={(e) =>
                  setValue({
                    ...value,
                    savePassword: e.target.checked,
                    clearSavedPassword: e.target.checked ? false : value.clearSavedPassword
                  })
                }
                className="rounded border-border accent-accent"
              />
              <span className="text-sm text-text-primary">
                {value.hasSavedPassword ? "Replace saved password" : "Save password securely"}
              </span>
            </label>

            {value.hasSavedPassword && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.clearSavedPassword}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      clearSavedPassword: e.target.checked,
                      savePassword: e.target.checked ? false : value.savePassword,
                      password: e.target.checked ? "" : value.password
                    })
                  }
                  className="rounded border-border accent-accent"
                />
                <span className="text-sm text-text-primary">Remove saved password</span>
              </label>
            )}

            {value.savePassword && (
              <label htmlFor={`${formId}-password`} className="grid gap-1.5">
                <span className="text-xs font-medium text-text-secondary">Password</span>
                <input
                  id={`${formId}-password`}
                  type="password"
                  value={value.password}
                  onChange={(e) => setValue({ ...value, password: e.target.value })}
                  autoComplete="new-password"
                  className={inputClasses}
                />
                {errors.password && (
                  <span className="text-xs text-red-400">{errors.password}</span>
                )}
              </label>
            )}
          </div>
        )}

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
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">1Password Reference</span>
            <div className="flex gap-1.5">
              <input
                id={`${formId}-opReference`}
                value={value.opReference}
                onChange={(e) => setValue({ ...value, opReference: e.target.value })}
                placeholder="op://vault/item/field"
                className={`${inputClasses} flex-1`}
              />
              <button
                type="button"
                onClick={() => setOpPickerOpen(true)}
                title="Browse 1Password vault"
                className="shrink-0 rounded-md border border-border bg-base-800 px-2.5 hover:bg-base-700 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 2a4.5 4.5 0 1 0 2.76 8.05l2.85 2.85a.75.75 0 1 0 1.06-1.06l-2.85-2.85A4.5 4.5 0 0 0 6.5 2ZM3 6.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z" fill="currentColor" />
                </svg>
              </button>
            </div>
            <span className="text-xs text-text-muted/70">
              Enter an <code>op://</code> reference or browse your vault.
            </span>
            <OpPickerModal
              open={opPickerOpen}
              onClose={() => setOpPickerOpen(false)}
              onSelect={(ref) => setValue({ ...value, opReference: ref })}
            />
          </div>
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

      {/* --- Connection --- */}
      <div className="grid gap-3 pt-2 border-t border-border/40">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Connection</span>

        <label htmlFor={`${formId}-proxyJump`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Jump Host (ProxyJump)</span>
          <input
            id={`${formId}-proxyJump`}
            value={value.proxyJump}
            onChange={(e) => setValue({ ...value, proxyJump: e.target.value })}
            placeholder="user@bastion:22"
            className={inputClasses}
          />
          <span className="text-xs text-text-muted/70">
            SSH ProxyJump chain. Comma-separate for multi-hop (e.g. bastion1,bastion2).
          </span>
        </label>

        <label htmlFor={`${formId}-keepAlive`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Keep-Alive Interval</span>
          <div className="flex items-center gap-2">
            <input
              id={`${formId}-keepAlive`}
              type="number"
              min={0}
              value={value.keepAliveInterval}
              onChange={(e) => setValue({ ...value, keepAliveInterval: e.target.value })}
              placeholder="30"
              className={inputClasses}
            />
            <span className="text-xs text-text-muted shrink-0">seconds</span>
          </div>
          <span className="text-xs text-text-muted/70">
            Leave empty for default (30s). Set to 0 to disable.
          </span>
        </label>
      </div>

      {/* --- Reliability --- */}
      <div className="grid gap-3 pt-2 border-t border-border/40">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Reliability</span>

        <label htmlFor={`${formId}-autoReconnect`} className="flex items-center gap-3 cursor-pointer">
          <input
            id={`${formId}-autoReconnect`}
            type="checkbox"
            checked={value.autoReconnect}
            onChange={(e) => setValue({ ...value, autoReconnect: e.target.checked })}
            className="rounded border-border accent-accent"
          />
          <span className="text-sm text-text-primary">Auto-reconnect on disconnect</span>
        </label>

        {value.autoReconnect && (
          <div className="grid grid-cols-2 gap-3 pl-6">
            <label htmlFor={`${formId}-maxAttempts`} className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Max Attempts</span>
              <input
                id={`${formId}-maxAttempts`}
                type="number"
                min={1}
                max={50}
                value={value.reconnectMaxAttempts}
                onChange={(e) => setValue({ ...value, reconnectMaxAttempts: Number(e.target.value) || 5 })}
                className={inputClasses}
              />
            </label>
            <label htmlFor={`${formId}-baseInterval`} className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Base Interval</span>
              <div className="flex items-center gap-2">
                <input
                  id={`${formId}-baseInterval`}
                  type="number"
                  min={1}
                  max={60}
                  value={value.reconnectBaseInterval}
                  onChange={(e) => setValue({ ...value, reconnectBaseInterval: Number(e.target.value) || 1 })}
                  className={inputClasses}
                />
                <span className="text-xs text-text-muted shrink-0">sec</span>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* --- Port Forwards --- */}
      {hostId && <HostPortForwardList hostId={hostId} />}

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
