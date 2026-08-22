import { useEffect, useId, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import type { HostEnvVarRecord, HostProfileRecord, TagRecord } from "@hypershell/shared";
import {
  ENV_VAR_NAME_REGEX,
  HOST_OPTION_DEFAULTS,
  isValidHostname,
  isValidPort
} from "@hypershell/shared";
import { HostPortForwardList } from "./HostPortForwardList";
import { OpPickerModal } from "./OpPickerModal";
import { HostProfileManagerDialog } from "./HostProfileManagerDialog";
import { TagManager } from "./TagManager";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { getShell, hasShell } from "../../lib/shell";

// --- Validation helpers ---

export { ENV_VAR_NAME_REGEX };

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
  shellIntegration: boolean;
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
  port: HOST_OPTION_DEFAULTS.port,
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
  autoReconnect: HOST_OPTION_DEFAULTS.autoReconnect,
  reconnectMaxAttempts: HOST_OPTION_DEFAULTS.reconnectMaxAttempts,
  reconnectBaseInterval: HOST_OPTION_DEFAULTS.reconnectBaseInterval,
  password: "",
  savePassword: true,
  clearSavedPassword: false,
  tmuxDetect: HOST_OPTION_DEFAULTS.tmuxDetect,
  shellIntegration: HOST_OPTION_DEFAULTS.shellIntegration,
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
      const result = await getShell().sshKeysConvertPpk({ ppkPath: value.identityFile });
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
        const keys = await getShell().fsListSshKeys();
        if (keys?.length) setSshKeys(keys);
      } catch { /* ignore */ }
    }
    void loadKeys();
  }, []);

  useEffect(() => {
    async function loadHostProfiles() {
      try {
        const profiles = await getShell().listHostProfiles();
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
      if (!hasShell()) {
        if (!cancelled) {
          setTags([]);
          onTagsChanged?.([]);
        }
        return;
      }

      try {
        const loadedTags = await getShell().listTags();
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
    if (!currentHostId || !hasShell()) {
      return;
    }
    const hostIdForLoad = currentHostId;
    const getHostTagsForLoad = getShell().tagsGetHostTags;
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
    if (!currentHostId || !hasShell()) {
      return;
    }
    const hostIdForLoad = currentHostId;
    const listHostEnvVarsForLoad = getShell().listHostEnvVars;
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
        {/* --- Connection --- */}
        <div className="grid gap-4">
          <SectionLabel className="px-0 pt-3 pb-1">Connection</SectionLabel>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`${formId}-hostProfile`}
                className="text-xs font-medium text-text-secondary"
              >
                Profile
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProfileManagerOpen(true)}
              >
                Manage Profiles
              </Button>
            </div>
            <Select
              id={`${formId}-hostProfile`}
              value={value.hostProfileId ?? ""}
              onChange={(event) => applyHostProfile(event.target.value)}
            >
              <option value="">No profile</option>
              {hostProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </Select>
            {selectedHostProfile && (
              <span className="text-[11px] text-text-muted">
                Applying profile defaults from "{selectedHostProfile.name}". You can still override any field below.
              </span>
            )}
          </div>

          <label htmlFor={`${formId}-name`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Name</span>
            <Input
              id={`${formId}-name`}
              value={value.name}
              onChange={(e) => setValue({ ...value, name: e.target.value })}
            />
          </label>

          <label htmlFor={`${formId}-hostname`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Hostname</span>
            <Input
              id={`${formId}-hostname`}
              value={value.hostname}
              onChange={(e) => setValue({ ...value, hostname: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, hostname: true }))}
              placeholder="web-01.example.com"
            />
            {touched.hostname && errors.hostname && (
              <span className="text-[11px] text-danger">{errors.hostname}</span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor={`${formId}-port`} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Port</span>
              <Input
                id={`${formId}-port`}
                type="number"
                min={1}
                max={65535}
                value={value.port}
                onChange={(e) => setValue({ ...value, port: Number(e.target.value) || HOST_OPTION_DEFAULTS.port })}
                onBlur={() => setTouched((t) => ({ ...t, port: true }))}
              />
              {touched.port && errors.port && (
                <span className="text-[11px] text-danger">{errors.port}</span>
              )}
            </label>
            <label htmlFor={`${formId}-username`} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Username</span>
              <Input
                id={`${formId}-username`}
                value={value.username}
                onChange={(e) => setValue({ ...value, username: e.target.value })}
              />
            </label>
          </div>
        </div>

        {/* --- Authentication --- */}
        <div className="grid gap-4 border-t border-border/40">
          <SectionLabel className="px-0 pt-3 pb-1">Authentication</SectionLabel>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-identityFile`}
              className="text-xs font-medium text-text-secondary"
            >
              SSH Key
            </label>
            <Select
              id={`${formId}-identityFile`}
              value={value.identityFile}
              onChange={(e) => setValue({ ...value, identityFile: e.target.value })}
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
            </Select>
            {identityWarning && (
              <span className="text-[11px] text-warning">{identityWarning}</span>
            )}
            {isPpkSelected && (
              <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-warning">
                  <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[11px] text-warning flex-1">
                  This is a PuTTY PPK key. It must be converted to OpenSSH format before use.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ppkConverting}
                  onClick={() => void handleConvertPpk()}
                >
                  {ppkConverting ? "Converting..." : "Convert"}
                </Button>
              </div>
            )}
          </div>

          <label htmlFor={`${formId}-authMethod`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Method</span>
            <Select
              id={`${formId}-authMethod`}
              value={value.authMethod}
              onChange={(e) => {
                const nextMethod = e.target.value as HostFormValue["authMethod"];
                setValue((previous) => applyAuthMethodSelection(previous, nextMethod));
              }}
            >
              <option value="default">Default (SSH config)</option>
              <option value="password">Password</option>
              <option value="keyfile">Key File</option>
              <option value="agent">SSH Agent</option>
              <option value="op-reference">1Password Reference</option>
            </Select>
          </label>

          {value.authMethod === "password" && (
            <div className="grid gap-2">
              {value.hasSavedPassword && !value.clearSavedPassword && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    {passwordSavedLabel ?? "Password saved securely"}
                  </span>
                  <span className="text-[11px] text-text-muted">
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
                <span className="text-xs font-medium text-text-secondary">
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
                  <span className="text-xs font-medium text-text-secondary">Remove saved password</span>
                </label>
              )}

              {value.savePassword && (
                <label htmlFor={`${formId}-password`} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">Password</span>
                  <Input
                    id={`${formId}-password`}
                    type="password"
                    value={value.password}
                    onChange={(e) => setValue({ ...value, password: e.target.value })}
                    autoComplete="new-password"
                  />
                  {errors.password && (
                    <span className="text-[11px] text-danger">{errors.password}</span>
                  )}
                </label>
              )}
            </div>
          )}

          {value.authMethod === "keyfile" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-keyfilePath`}
                className="text-xs font-medium text-text-secondary"
              >
                Key File
              </label>
              <div className="flex gap-1.5">
                <Input
                  id={`${formId}-keyfilePath`}
                  value={value.identityFile}
                  onChange={(e) => setValue({ ...value, identityFile: e.target.value })}
                  placeholder="Path to SSH private key"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const filePath = await getShell().fsShowOpenDialog({
                        title: "Select SSH Key File",
                        filters: [{ name: "All Files", extensions: ["*"] }],
                      });
                      if (filePath) {
                        setValue({ ...value, identityFile: filePath });
                      }
                    })();
                  }}
                  className="shrink-0"
                  title="Browse for key file"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 13h12M8 3v7M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              </div>
            </div>
          )}

          {value.authMethod === "agent" && (
            <label htmlFor={`${formId}-agentKind`} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Agent Type</span>
              <Select
                id={`${formId}-agentKind`}
                value={value.agentKind}
                onChange={(e) =>
                  setValue({
                    ...value,
                    agentKind: e.target.value as HostFormValue["agentKind"]
                  })
                }
              >
                <option value="system">System SSH Agent</option>
                <option value="pageant">Pageant</option>
                <option value="1password">1Password SSH Agent</option>
              </Select>
            </label>
          )}

          {value.authMethod === "op-reference" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${formId}-opReference`}
                className="text-xs font-medium text-text-secondary"
              >
                1Password Reference
              </label>
              <div className="flex gap-1.5">
                <Input
                  id={`${formId}-opReference`}
                  value={value.opReference}
                  onChange={(e) => setValue({ ...value, opReference: e.target.value })}
                  placeholder="op://vault/item/field"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpPickerOpen(true)}
                  title="Browse 1Password vault"
                  className="shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6.5 2a4.5 4.5 0 1 0 2.76 8.05l2.85 2.85a.75.75 0 1 0 1.06-1.06l-2.85-2.85A4.5 4.5 0 0 0 6.5 2ZM3 6.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z" fill="currentColor" />
                  </svg>
                </Button>
              </div>
              <span className="text-[11px] text-text-muted">
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

        {/* --- Organization --- */}
        <div className="grid gap-4 border-t border-border/40">
          <SectionLabel className="px-0 pt-3 pb-1">Organization</SectionLabel>

          <label htmlFor={`${formId}-group`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Group</span>
            <Input
              id={`${formId}-group`}
              value={value.group}
              onChange={(e) => setValue({ ...value, group: e.target.value })}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-secondary">Tags</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTagManagerOpen(true)}
              >
                Manage Tags
              </Button>
            </div>

            {tags.length === 0 ? (
              <p className="rounded-md border border-border/60 bg-base-900/40 px-3 py-2 text-[11px] text-text-muted">
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

            <span className="text-[11px] text-text-muted">
              {selectedTags.length > 0
                ? `Selected: ${selectedTagSummary}`
                : "No tags selected."}
            </span>
          </div>
        </div>

        {/* --- Advanced --- */}
        <div className="grid gap-4 border-t border-border/40">
          <SectionLabel className="px-0 pt-3 pb-1">Advanced</SectionLabel>

          <details open className="grid gap-3">
            <summary className="cursor-pointer select-none text-xs font-medium text-text-secondary">
              Environment Variables
            </summary>
            <span className="text-[11px] text-text-muted">
              Variables are applied when opening SSH terminal sessions for this host.
            </span>

            {value.envVars.length === 0 ? (
              <p className="text-[11px] text-text-muted">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEnvVar(item.id)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        value={item.name}
                        onChange={(event) =>
                          updateEnvVar(item.id, { name: event.target.value })
                        }
                        placeholder="NAME"
                      />
                      <Input
                        value={item.value}
                        onChange={(event) =>
                          updateEnvVar(item.id, { value: event.target.value })
                        }
                        placeholder="value"
                      />
                      <label className="flex items-center gap-2 px-1 text-xs font-medium text-text-secondary">
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
                      <span className="text-[11px] text-danger">
                        {envVarNameErrors[index]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <Button variant="outline" size="sm" onClick={addEnvVar}>
                Add Variable
              </Button>
            </div>
          </details>

          <label htmlFor={`${formId}-proxyJump`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Jump Host (ProxyJump)</span>
            <Input
              id={`${formId}-proxyJump`}
              value={value.proxyJump}
              onChange={(e) => setValue({ ...value, proxyJump: e.target.value })}
              placeholder="user@bastion:22"
            />
            <span className="text-[11px] text-text-muted">
              SSH ProxyJump chain. Comma-separate for multi-hop (e.g. bastion1,bastion2).
            </span>
          </label>

          <label htmlFor={`${formId}-keepAlive`} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Keep-Alive Interval</span>
            <div className="flex items-center gap-2">
              <Input
                id={`${formId}-keepAlive`}
                type="number"
                min={0}
                value={value.keepAliveInterval}
                onChange={(e) => setValue({ ...value, keepAliveInterval: e.target.value })}
                placeholder="30"
              />
              <span className="text-[11px] text-text-muted shrink-0">seconds</span>
            </div>
            <span className="text-[11px] text-text-muted">
              Leave empty for default (30s). Set to 0 to disable.
            </span>
          </label>

          <label htmlFor={`${formId}-autoReconnect`} className="flex items-center gap-3 cursor-pointer">
            <input
              id={`${formId}-autoReconnect`}
              type="checkbox"
              checked={value.autoReconnect}
              onChange={(e) => setValue({ ...value, autoReconnect: e.target.checked })}
              className="rounded border-border accent-accent"
            />
            <span className="text-xs font-medium text-text-secondary">Auto-reconnect on disconnect</span>
          </label>

          {value.autoReconnect && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <label htmlFor={`${formId}-maxAttempts`} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Max Attempts</span>
                <Input
                  id={`${formId}-maxAttempts`}
                  type="number"
                  min={1}
                  max={50}
                  value={value.reconnectMaxAttempts}
                  onChange={(e) => setValue({ ...value, reconnectMaxAttempts: Number(e.target.value) || HOST_OPTION_DEFAULTS.reconnectMaxAttempts })}
                />
              </label>
              <label htmlFor={`${formId}-baseInterval`} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Base Interval</span>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${formId}-baseInterval`}
                    type="number"
                    min={1}
                    max={60}
                    value={value.reconnectBaseInterval}
                    onChange={(e) => setValue({ ...value, reconnectBaseInterval: Number(e.target.value) || HOST_OPTION_DEFAULTS.reconnectBaseInterval })}
                  />
                  <span className="text-[11px] text-text-muted shrink-0">sec</span>
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
              <span className="text-xs font-medium text-text-secondary">Detect tmux sessions on connect</span>
              {value.tmuxDetect && value.authMethod === "password" && (
                <span className="block text-[11px] text-warning mt-0.5">Requires key-based auth — password-only hosts cannot be probed</span>
              )}
            </div>
          </label>

          <label htmlFor={`${formId}-shellIntegration`} className="flex items-center gap-3 cursor-pointer">
            <input
              id={`${formId}-shellIntegration`}
              type="checkbox"
              checked={value.shellIntegration}
              onChange={(e) => setValue({ ...value, shellIntegration: e.target.checked })}
              className="rounded border-border accent-accent"
            />
            <div>
              <span className="text-xs font-medium text-text-secondary">Report the running command in the tab title</span>
              <span className="block text-[11px] text-text-muted mt-0.5">Sends a one-line hook to bash/zsh when the session opens.</span>
            </div>
          </label>
        </div>

        {/* --- Port Forwards --- */}
        {hostId && <HostPortForwardList hostId={hostId} />}

        <Button
          type="submit"
          variant="primary"
          disabled={hasErrors}
          className="justify-self-start"
        >
          {submitLabel}
        </Button>
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
