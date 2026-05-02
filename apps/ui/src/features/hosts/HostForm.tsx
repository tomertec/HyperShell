import { useEffect, useId, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import type { HostEnvVarRecord, HostProfileRecord, TagRecord } from "@hypershell/shared";
import { HostPortForwardList } from "./HostPortForwardList";
import { OpPickerModal } from "./OpPickerModal";
import { HostProfileManagerDialog } from "./HostProfileManagerDialog";
import { TagManager } from "./TagManager";
import { inputClasses } from "../../lib/formStyles";

// --- Validation helpers ---

const hostnameRegex =
  /^(?:localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;

const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

const ipv6Regex = /^\[?[0-9a-fA-F:]+\]?$/;
export const ENV_VAR_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

function createEnvVarId(): string {
  return `env-${crypto.randomUUID()}`;
}

export type HostEnvVarFormValue = {
  id: string;
  name: string;
  value: string;
  isEnabled: boolean;
  sortOrder: number;
};

function mapHostEnvVarRecordToFormValue(
  value: Pick<HostEnvVarRecord, "id" | "name" | "value" | "isEnabled" | "sortOrder">,
  fallbackSortOrder: number
): HostEnvVarFormValue {
  return {
    id: value.id || createEnvVarId(),
    name: value.name ?? "",
    value: value.value ?? "",
    isEnabled: value.isEnabled ?? true,
    sortOrder: value.sortOrder ?? fallbackSortOrder,
  };
}

export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  identityFile: string;
  hostProfileId?: string;
  envVars: HostEnvVarFormValue[];
  group: string;
  tags: string;
  tagIds: string[];
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
  tmuxDetect: boolean;
  hasSavedPassword?: boolean;
  passwordSavedAt?: string | null;
};

export interface HostFormProps {
  hostId?: string;  // set when editing existing host
  initialValue?: Partial<HostFormValue>;
  submitLabel?: string;
  onTagsChanged?: (tags: TagRecord[]) => void;
  onSubmit: (value: HostFormValue) => void;
}

const defaultValue: HostFormValue = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
  identityFile: "",
  hostProfileId: "",
  envVars: [],
  group: "",
  tags: "",
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
  password: "",
  savePassword: true,
  clearSavedPassword: false,
  tmuxDetect: false,
  hasSavedPassword: false,
  passwordSavedAt: null,
};

function buildInitialValue(initialValue?: Partial<HostFormValue>): HostFormValue {
  const hasSavedPassword = Boolean(initialValue?.hasSavedPassword);
  const initialTagIds = Array.isArray(initialValue?.tagIds)
    ? Array.from(new Set(initialValue.tagIds))
    : [];
  const initialEnvVars = Array.isArray(initialValue?.envVars)
    ? initialValue.envVars.map((item, index) =>
        mapHostEnvVarRecordToFormValue(item, index)
      )
    : [];
  return {
    ...defaultValue,
    ...initialValue,
    tagIds: initialTagIds,
    envVars: initialEnvVars,
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

function applyAuthMethodSelection(
  previous: HostFormValue,
  nextMethod: HostFormValue["authMethod"]
): HostFormValue {
  if (nextMethod === "password") {
    return {
      ...previous,
      authMethod: nextMethod,
      savePassword: !previous.hasSavedPassword,
      clearSavedPassword: false,
      password: ""
    };
  }

  return {
    ...previous,
    authMethod: nextMethod,
    savePassword: false,
    clearSavedPassword: false,
    password: ""
  };
}

export function HostForm({
  hostId,
  initialValue,
  submitLabel = "Save host",
  onTagsChanged,
  onSubmit
}: HostFormProps) {
  const formId = useId();
  const [value, setValue] = useState<HostFormValue>(buildInitialValue(initialValue));
  const [sshKeys, setSshKeys] = useState<string[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [opPickerOpen, setOpPickerOpen] = useState(false);
  const [ppkConverting, setPpkConverting] = useState(false);
  const [hostProfiles, setHostProfiles] = useState<HostProfileRecord[]>([]);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  const isPpkSelected = useMemo(
    () => value.identityFile.toLowerCase().endsWith(".ppk"),
    [value.identityFile]
  );

  const selectedHostProfile = useMemo(
    () =>
      hostProfiles.find((profile) => profile.id === (value.hostProfileId ?? "")) ??
      null,
    [hostProfiles, value.hostProfileId]
  );

  const selectedTags = useMemo(() => {
    const selectedIdSet = new Set(value.tagIds);
    return tags.filter((tag) => selectedIdSet.has(tag.id));
  }, [tags, value.tagIds]);

  const selectedTagSummary = useMemo(
    () => selectedTags.map((tag) => tag.name).join(", "),
    [selectedTags]
  );

  const applyHostProfile = useCallback(
    (profileId: string) => {
      const profile =
        hostProfiles.find((candidate) => candidate.id === profileId) ?? null;

      setValue((previous) => {
        if (!profile) {
          return { ...previous, hostProfileId: "" };
        }

        const withAuthMethod = applyAuthMethodSelection(
          { ...previous, hostProfileId: profile.id },
          profile.authMethod
        );

        return {
          ...withAuthMethod,
          port: profile.defaultPort,
          username: profile.defaultUsername ?? "",
          identityFile: profile.identityFile ?? "",
          proxyJump: profile.proxyJump ?? "",
          keepAliveInterval:
            profile.keepAliveInterval == null
              ? withAuthMethod.keepAliveInterval
              : String(profile.keepAliveInterval),
        };
      });
    },
    [hostProfiles]
  );

  const addEnvVar = useCallback(() => {
    setValue((previous) => ({
      ...previous,
      envVars: [
        ...previous.envVars,
        {
          id: createEnvVarId(),
          name: "",
          value: "",
          isEnabled: true,
          sortOrder: previous.envVars.length,
        },
      ],
    }));
  }, []);

  const updateEnvVar = useCallback(
    (id: string, updates: Partial<HostEnvVarFormValue>) => {
      setValue((previous) => ({
        ...previous,
        envVars: previous.envVars.map((item, index) =>
          item.id === id
            ? { ...item, ...updates, sortOrder: index }
            : { ...item, sortOrder: index }
        ),
      }));
    },
    []
  );

  const removeEnvVar = useCallback((id: string) => {
    setValue((previous) => ({
      ...previous,
      envVars: previous.envVars
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, sortOrder: index })),
    }));
  }, []);

  const toggleTag = useCallback((tagId: string) => {
    setValue((previous) => {
      const selected = new Set(previous.tagIds);
      if (selected.has(tagId)) {
        selected.delete(tagId);
      } else {
        selected.add(tagId);
      }

      return {
        ...previous,
        tagIds: Array.from(selected),
      };
    });
  }, []);

  const handleConvertPpk = useCallback(async () => {
    if (!value.identityFile) return;
    setPpkConverting(true);
    try {
      const result = await window.hypershell?.sshKeysConvertPpk?.({ ppkPath: value.identityFile });
      if (!result) {
        toast.error("PPK conversion not available.");
        return;
      }
      if (result.success && result.outputPath) {
        toast.success("PPK key converted to OpenSSH format.");
        setValue({ ...value, identityFile: result.outputPath });
      } else {
        toast.error(result.error ?? "Conversion failed.");
      }
    } catch (err) {
      toast.error(`Conversion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPpkConverting(false);
    }
  }, [value]);

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

  const envVarNameErrors = useMemo(
    () =>
      value.envVars.map((item) => {
        const trimmedName = item.name.trim();
        if (trimmedName.length === 0) {
          return "Variable name is required.";
        }
        if (!ENV_VAR_NAME_REGEX.test(trimmedName)) {
          return "Use A-Z, 0-9, and _. First character must be a letter or _.";
        }
        return null;
      }),
    [value.envVars]
  );

  const identityWarning = useMemo(
    () => isIdentityFilePathSuspicious(value.identityFile),
    [value.identityFile]
  );

  const hasErrors =
    Object.values(errors).some(Boolean) || envVarNameErrors.some(Boolean);
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
        const keys = await window.hypershell?.fsListSshKeys?.();
        if (keys?.length) setSshKeys(keys);
      } catch { /* ignore */ }
    }
    void loadKeys();
  }, []);

  useEffect(() => {
    async function loadHostProfiles() {
      try {
        const profiles = await window.hypershell?.listHostProfiles?.();
        setHostProfiles(profiles ?? []);
      } catch {
        setHostProfiles([]);
      }
    }
    void loadHostProfiles();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTags() {
      if (!window.hypershell?.listTags) {
        if (!cancelled) {
          setTags([]);
          onTagsChanged?.([]);
        }
        return;
      }

      try {
        const loadedTags = await window.hypershell.listTags();
        if (cancelled) {
          return;
        }
        setTags(loadedTags);
        onTagsChanged?.(loadedTags);
        setValue((previous) => ({
          ...previous,
          tagIds: previous.tagIds.filter((tagId) =>
            loadedTags.some((tag) => tag.id === tagId)
          ),
        }));
      } catch {
        if (!cancelled) {
          setTags([]);
        }
      }
    }
    void loadTags();

    return () => {
      cancelled = true;
    };
  }, [onTagsChanged]);

  useEffect(() => {
    const currentHostId = hostId;
    const tagsGetHostTags = window.hypershell?.tagsGetHostTags;
    if (!currentHostId || !tagsGetHostTags) {
      return;
    }
    const hostIdForLoad = currentHostId;
    const getHostTagsForLoad = tagsGetHostTags;
    let cancelled = false;
    async function loadHostTags() {
      try {
        const hostTags = await getHostTagsForLoad({
          hostId: hostIdForLoad,
        });
        if (cancelled || !hostTags) {
          return;
        }
        setValue((previous) => ({
          ...previous,
          tagIds: hostTags.map((tag) => tag.id),
          tags: hostTags.map((tag) => tag.name).join(", "),
        }));
      } catch {
        // Ignore tag load failures in the host form.
      }
    }
    void loadHostTags();

    return () => {
      cancelled = true;
    };
  }, [hostId]);

  useEffect(() => {
    if (value.tagIds.length > 0 || tags.length === 0) {
      return;
    }
    const rawTags = value.tags.trim();
    if (!rawTags) {
      return;
    }

    const requestedNames = rawTags
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    if (requestedNames.length === 0) {
      return;
    }

    const requestedNameSet = new Set(requestedNames);
    const matchingTagIds = tags
      .filter((tag) => requestedNameSet.has(tag.name.toLowerCase()))
      .map((tag) => tag.id);

    if (matchingTagIds.length === 0) {
      return;
    }

    setValue((previous) => ({
      ...previous,
      tagIds: Array.from(new Set(matchingTagIds)),
    }));
  }, [tags, value.tagIds.length, value.tags]);

  useEffect(() => {
    const currentHostId = hostId;
    const listHostEnvVars = window.hypershell?.listHostEnvVars;
    if (!currentHostId || !listHostEnvVars) {
      return;
    }
    const hostIdForLoad = currentHostId;
    const listHostEnvVarsForLoad = listHostEnvVars;
    let cancelled = false;
    async function loadHostEnvVars() {
      try {
        const envVars = await listHostEnvVarsForLoad({ hostId: hostIdForLoad });
        if (cancelled || !envVars) {
          return;
        }
        setValue((previous) => ({
          ...previous,
          envVars: envVars.map((item, index) =>
            mapHostEnvVarRecordToFormValue(item, index)
          ),
        }));
      } catch {
        // Ignore env var load failures in the host form.
      }
    }
    void loadHostEnvVars();

    return () => {
      cancelled = true;
    };
  }, [hostId]);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const normalizedTagIds = Array.from(new Set(value.tagIds));
          onSubmit({
            ...value,
            tags: selectedTagSummary || value.tags,
            tagIds: normalizedTagIds,
            envVars: value.envVars.map((item, index) => ({
              ...item,
              name: item.name.trim(),
              sortOrder: index,
            })),
          });
        }}
        className="grid gap-5"
      >
        <label htmlFor={`${formId}-hostProfile`} className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-secondary">Profile</span>
            <button
              type="button"
              onClick={() => setProfileManagerOpen(true)}
              className="rounded-md border border-border bg-base-800 px-2 py-1 text-[11px] text-text-primary transition-colors hover:bg-base-700"
            >
              Manage Profiles
            </button>
          </div>
          <select
            id={`${formId}-hostProfile`}
            value={value.hostProfileId ?? ""}
            onChange={(event) => applyHostProfile(event.target.value)}
            className={inputClasses}
          >
            <option value="">No profile</option>
            {hostProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          {selectedHostProfile && (
            <span className="text-xs text-text-muted/70">
              Applying profile defaults from "{selectedHostProfile.name}". You can still override any field below.
            </span>
          )}
        </label>

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
        {isPpkSelected && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-amber-400">
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-xs text-amber-300 flex-1">
              This is a PuTTY PPK key. It must be converted to OpenSSH format before use.
            </span>
            <button
              type="button"
              disabled={ppkConverting}
              onClick={() => void handleConvertPpk()}
              className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ppkConverting ? "Converting..." : "Convert"}
            </button>
          </div>
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
              setValue((previous) => applyAuthMethodSelection(previous, nextMethod));
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

        {value.authMethod === "keyfile" && (
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Key File</span>
            <div className="flex gap-1.5">
              <input
                id={`${formId}-keyfilePath`}
                value={value.identityFile}
                onChange={(e) => setValue({ ...value, identityFile: e.target.value })}
                placeholder="Path to SSH private key"
                className={`${inputClasses} flex-1`}
              />
              <button
                type="button"
                onClick={async () => {
                  const filePath = await window.hypershell?.fsShowOpenDialog?.({
                    title: "Select SSH Key File",
                    filters: [{ name: "All Files", extensions: ["*"] }],
                  });
                  if (filePath) {
                    setValue({ ...value, identityFile: filePath });
                  }
                }}
                className="shrink-0 rounded-md border border-border bg-base-800 px-2.5 hover:bg-base-700 text-text-muted hover:text-text-primary transition-colors"
                title="Browse for key file"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 13h12M8 3v7M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
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

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-secondary">Tags</span>
          <button
            type="button"
            onClick={() => setTagManagerOpen(true)}
            className="rounded-md border border-border bg-base-800 px-2 py-1 text-[11px] text-text-primary transition-colors hover:bg-base-700"
          >
            Manage Tags
          </button>
        </div>

        {tags.length === 0 ? (
          <p className="rounded-md border border-border/60 bg-base-900/40 px-3 py-2 text-xs text-text-muted/80">
            No tags defined yet. Use "Manage Tags" to create reusable labels.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = value.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    selected
                      ? "border-accent/50 bg-accent/15 text-text-primary"
                      : "border-border bg-base-800/70 text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#64748b" }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}

        <span className="text-xs text-text-muted/70">
          {selectedTags.length > 0
            ? `Selected: ${selectedTagSummary}`
            : "No tags selected."}
        </span>
      </div>

      <div className="grid gap-3 pt-2 border-t border-border/40">
        <details open className="grid gap-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Environment Variables
          </summary>
          <span className="text-xs text-text-muted/70">
            Variables are applied when opening SSH terminal sessions for this host.
          </span>

          {value.envVars.length === 0 ? (
            <p className="text-xs text-text-muted/70">
              No variables configured.
            </p>
          ) : (
            <div className="grid gap-2">
              {value.envVars.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-border/60 bg-surface/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Variable {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEnvVar(item.id)}
                      className="rounded border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      value={item.name}
                      onChange={(event) =>
                        updateEnvVar(item.id, { name: event.target.value })
                      }
                      placeholder="NAME"
                      className={inputClasses}
                    />
                    <input
                      value={item.value}
                      onChange={(event) =>
                        updateEnvVar(item.id, { value: event.target.value })
                      }
                      placeholder="value"
                      className={inputClasses}
                    />
                    <label className="flex items-center gap-2 px-1 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={item.isEnabled}
                        onChange={(event) =>
                          updateEnvVar(item.id, { isEnabled: event.target.checked })
                        }
                        className="rounded border-border accent-accent"
                      />
                      Enabled
                    </label>
                  </div>

                  {envVarNameErrors[index] && (
                    <span className="text-xs text-red-400">
                      {envVarNameErrors[index]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={addEnvVar}
              className="rounded-md border border-border bg-base-800 px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-base-700"
            >
              Add Variable
            </button>
          </div>
        </details>
      </div>

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

        <label htmlFor={`${formId}-tmuxDetect`} className="flex items-center gap-3 cursor-pointer">
          <input
            id={`${formId}-tmuxDetect`}
            type="checkbox"
            checked={value.tmuxDetect}
            onChange={(e) => setValue({ ...value, tmuxDetect: e.target.checked })}
            className="rounded border-border accent-accent"
          />
          <div>
            <span className="text-sm text-text-primary">Detect tmux sessions on connect</span>
            {value.tmuxDetect && value.authMethod === "password" && (
              <span className="block text-[11px] text-warning mt-0.5">Requires key-based auth — password-only hosts cannot be probed</span>
            )}
          </div>
        </label>
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

      <HostProfileManagerDialog
        open={profileManagerOpen}
        onClose={() => setProfileManagerOpen(false)}
        onProfilesChanged={(profiles) => {
          setHostProfiles(profiles);
          setValue((previous) => {
            if (!previous.hostProfileId) {
              return previous;
            }
            const exists = profiles.some((item) => item.id === previous.hostProfileId);
            return exists ? previous : { ...previous, hostProfileId: "" };
          });
        }}
      />

      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        onTagsChanged={(updatedTags) => {
          setTags(updatedTags);
          onTagsChanged?.(updatedTags);
          setValue((previous) => ({
            ...previous,
            tagIds: previous.tagIds.filter((tagId) =>
              updatedTags.some((tag) => tag.id === tagId)
            ),
          }));
        }}
      />
    </>
  );
}
