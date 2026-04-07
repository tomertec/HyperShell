import { useEffect, useId, useState } from "react";

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
          placeholder="web-01.example.com"
          className={inputClasses}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-port`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Port</span>
          <input
            id={`${formId}-port`}
            type="number"
            value={value.port}
            onChange={(e) => setValue({ ...value, port: Number(e.target.value) || 22 })}
            className={inputClasses}
          />
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
        className="justify-self-start rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40 active:bg-accent/30 transition-all duration-150"
      >
        {submitLabel}
      </button>
    </form>
  );
}
