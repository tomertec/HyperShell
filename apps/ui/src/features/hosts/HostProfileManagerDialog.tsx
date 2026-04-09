import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { HostProfileRecord } from "@hypershell/shared";
import { Modal } from "../layout/Modal";
import { inputClasses } from "../../lib/formStyles";

type ProfileDraft = {
  name: string;
  description: string;
  defaultPort: string;
  defaultUsername: string;
  authMethod: "default" | "password" | "keyfile" | "agent" | "op-reference";
  identityFile: string;
  proxyJump: string;
  keepAliveInterval: string;
};

const emptyDraft: ProfileDraft = {
  name: "",
  description: "",
  defaultPort: "22",
  defaultUsername: "",
  authMethod: "default",
  identityFile: "",
  proxyJump: "",
  keepAliveInterval: "",
};

function toDraft(profile: HostProfileRecord | null): ProfileDraft {
  if (!profile) {
    return { ...emptyDraft };
  }
  return {
    name: profile.name,
    description: profile.description ?? "",
    defaultPort: String(profile.defaultPort ?? 22),
    defaultUsername: profile.defaultUsername ?? "",
    authMethod: profile.authMethod,
    identityFile: profile.identityFile ?? "",
    proxyJump: profile.proxyJump ?? "",
    keepAliveInterval:
      profile.keepAliveInterval == null ? "" : String(profile.keepAliveInterval),
  };
}

interface HostProfileManagerDialogProps {
  open: boolean;
  onClose: () => void;
  onProfilesChanged?: (profiles: HostProfileRecord[]) => void;
}

export function HostProfileManagerDialog({
  open,
  onClose,
  onProfilesChanged,
}: HostProfileManagerDialogProps) {
  const [profiles, setProfiles] = useState<HostProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ ...emptyDraft });
  const [isSaving, setIsSaving] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const items = (await window.hypershell?.listHostProfiles?.()) ?? [];
      setProfiles(items);
      onProfilesChanged?.(items);
      setSelectedId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id ?? null;
      });
    } catch (error) {
      toast.error(`Failed to load host profiles: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [onProfilesChanged]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadProfiles();
  }, [loadProfiles, open]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(toDraft(selectedProfile));
  }, [open, selectedProfile]);

  const startNewProfile = useCallback(() => {
    setSelectedId(null);
    setDraft({ ...emptyDraft });
  }, []);

  const saveProfile = useCallback(async () => {
    if (!window.hypershell?.upsertHostProfile) {
      toast.error("Host profile API is unavailable.");
      return;
    }

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      toast.error("Profile name is required.");
      return;
    }

    const parsedPort = Number.parseInt(draft.defaultPort.trim(), 10);
    if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error("Default port must be between 1 and 65535.");
      return;
    }

    const trimmedKeepAlive = draft.keepAliveInterval.trim();
    const parsedKeepAlive =
      trimmedKeepAlive.length === 0 ? null : Number.parseInt(trimmedKeepAlive, 10);
    if (parsedKeepAlive != null && (!Number.isFinite(parsedKeepAlive) || parsedKeepAlive < 0)) {
      toast.error("Keep-alive interval must be empty or a non-negative number.");
      return;
    }

    setIsSaving(true);
    try {
      const id = selectedProfile?.id ?? `profile-${Date.now()}`;
      const saved = await window.hypershell.upsertHostProfile({
        id,
        name: trimmedName,
        description: draft.description.trim() || null,
        defaultPort: parsedPort,
        defaultUsername: draft.defaultUsername.trim() || null,
        authMethod: draft.authMethod,
        identityFile: draft.identityFile.trim() || null,
        proxyJump: draft.proxyJump.trim() || null,
        keepAliveInterval: parsedKeepAlive,
      });
      await loadProfiles();
      setSelectedId(saved.id);
      toast.success(selectedProfile ? "Profile updated." : "Profile created.");
    } catch (error) {
      toast.error(`Failed saving profile: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [draft, loadProfiles, selectedProfile]);

  const removeProfile = useCallback(async () => {
    if (!selectedProfile || !window.hypershell?.removeHostProfile) {
      return;
    }
    if (!window.confirm(`Delete host profile "${selectedProfile.name}"?`)) {
      return;
    }
    try {
      await window.hypershell.removeHostProfile({ id: selectedProfile.id });
      await loadProfiles();
      setSelectedId(null);
      setDraft({ ...emptyDraft });
      toast.success("Profile deleted.");
    } catch (error) {
      toast.error(`Failed deleting profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [loadProfiles, selectedProfile]);

  return (
    <Modal open={open} onClose={onClose} title="Host Profiles">
      <div className="grid gap-4 md:grid-cols-[220px,1fr]">
        <div className="grid gap-2 border-b border-border pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <button
            type="button"
            onClick={startNewProfile}
            className="rounded-md border border-border bg-base-800 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-base-700"
          >
            New Profile
          </button>
          <div className="max-h-72 overflow-y-auto">
            {profiles.length === 0 ? (
              <div className="rounded-md border border-border bg-base-900 px-3 py-2 text-xs text-text-muted">
                No profiles yet.
              </div>
            ) : (
              <div className="grid gap-1">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedId(profile.id)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedId === profile.id
                        ? "border-accent/40 bg-accent/10 text-text-primary"
                        : "border-border bg-base-900 text-text-secondary hover:bg-base-800"
                    }`}
                  >
                    {profile.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClasses}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Description</span>
            <input
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className={inputClasses}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Default Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={draft.defaultPort}
                onChange={(event) => setDraft({ ...draft, defaultPort: event.target.value })}
                className={inputClasses}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Default Username</span>
              <input
                value={draft.defaultUsername}
                onChange={(event) => setDraft({ ...draft, defaultUsername: event.target.value })}
                className={inputClasses}
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Authentication Method</span>
            <select
              value={draft.authMethod}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  authMethod: event.target.value as ProfileDraft["authMethod"],
                })
              }
              className={inputClasses}
            >
              <option value="default">Default (SSH config)</option>
              <option value="password">Password</option>
              <option value="keyfile">Key File</option>
              <option value="agent">SSH Agent</option>
              <option value="op-reference">1Password Reference</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Identity File</span>
            <input
              value={draft.identityFile}
              onChange={(event) => setDraft({ ...draft, identityFile: event.target.value })}
              placeholder="~/.ssh/id_ed25519"
              className={inputClasses}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">ProxyJump</span>
            <input
              value={draft.proxyJump}
              onChange={(event) => setDraft({ ...draft, proxyJump: event.target.value })}
              placeholder="user@bastion:22"
              className={inputClasses}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Keep-Alive Interval</span>
            <input
              type="number"
              min={0}
              value={draft.keepAliveInterval}
              onChange={(event) => setDraft({ ...draft, keepAliveInterval: event.target.value })}
              placeholder="Leave empty for default"
              className={inputClasses}
            />
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={isSaving}
              className="rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : selectedProfile ? "Update Profile" : "Create Profile"}
            </button>
            <button
              type="button"
              onClick={() => void removeProfile()}
              disabled={!selectedProfile}
              className="rounded-md border border-border bg-base-800 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-base-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
