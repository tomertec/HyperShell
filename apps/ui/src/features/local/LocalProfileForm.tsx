import { useCallback, useId, useMemo, useState } from "react";
import type {
  LocalProfileColor,
  LocalProfileEnvVar,
  LocalProfileIcon as LocalProfileIconKey,
  LocalProfileRecord,
  UpsertLocalProfileRequest
} from "@hypershell/shared";
import { ENV_VAR_NAME_REGEX } from "@hypershell/shared";
import { inputClasses } from "../../lib/formStyles";
import { localProfilesStore } from "./localProfilesStore";
import { LocalProfileIcon } from "./LocalProfileIcon";

export interface LocalProfileFormProps {
  profile: LocalProfileRecord | null;
  envVars: LocalProfileEnvVar[];
  // Whether `envVars` above reflects the profile's real saved values (vs. an
  // empty placeholder because the read-path call failed or is unavailable).
  // Ignored for new profiles (profile === null), where there's nothing to
  // lose. See shouldIncludeEnvVarsInUpsert.
  envVarsLoaded: boolean;
  onSave: (input: UpsertLocalProfileRequest) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

const ICON_OPTIONS: Array<{ key: LocalProfileIconKey; label: string }> = [
  { key: "powershell", label: "PowerShell" },
  { key: "cmd", label: "Command Prompt" },
  { key: "linux", label: "Linux" },
  { key: "bash", label: "Bash" },
  { key: "terminal", label: "Terminal" }
];

// Mirrors the host colour picker's named palette (SidebarHostList.tsx) — the
// CSS custom properties (--host-*) and .color-swatch-* classes are global,
// so these swatches render identically to host colours without importing
// from a sidebar-list component.
const PROFILE_COLORS: readonly LocalProfileColor[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "cyan",
  "purple",
  "pink"
];

function createEnvVarId(): string {
  return `local-env-${crypto.randomUUID()}`;
}

type LocalEnvVarFormValue = {
  id: string;
  name: string;
  value: string;
  isEnabled: boolean;
};

function toEnvVarFormValue(item: LocalProfileEnvVar): LocalEnvVarFormValue {
  return { id: createEnvVarId(), name: item.name, value: item.value, isEnabled: item.isEnabled };
}

export function parseArgs(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function isUniqueNameConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed:\s*local_profiles\.name/i.test(message);
}

// Editing an existing profile whose saved env vars we could not confidently
// load must never overwrite them with an empty array — that would silently
// destroy data the user never touched. Creating a new profile has nothing to
// lose, so it always includes envVars (even an empty one).
export function shouldIncludeEnvVarsInUpsert(
  isNewProfile: boolean,
  envVarsLoaded: boolean
): boolean {
  return isNewProfile || envVarsLoaded;
}

export function LocalProfileForm({
  profile,
  envVars,
  envVarsLoaded,
  onSave,
  onCancel,
  onDelete
}: LocalProfileFormProps) {
  const formId = useId();
  const [id] = useState(() => profile?.id ?? crypto.randomUUID());
  const [name, setName] = useState(profile?.name ?? "");
  const [executable, setExecutable] = useState(profile?.executable ?? "");
  const [argsText, setArgsText] = useState(() => (profile?.args ?? []).join(" "));
  const [startingDirectory, setStartingDirectory] = useState(profile?.startingDirectory ?? "");
  const [icon, setIcon] = useState<LocalProfileIconKey>(profile?.icon ?? "terminal");
  const [color, setColor] = useState<LocalProfileColor | null>(profile?.color ?? null);
  const [claudeSession, setClaudeSession] = useState(profile?.claudeSession ?? false);
  const [claudeSessionMode, setClaudeSessionMode] = useState<"continue" | "new">(
    profile?.claudeSessionMode ?? "continue"
  );
  const [envVarRows, setEnvVarRows] = useState<LocalEnvVarFormValue[]>(() =>
    envVars.map(toEnvVarFormValue)
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDetected = profile?.source === "detected";
  const envVarsKnown = shouldIncludeEnvVarsInUpsert(!profile, envVarsLoaded);

  const addEnvVar = useCallback(() => {
    setEnvVarRows((prev) => [...prev, { id: createEnvVarId(), name: "", value: "", isEnabled: true }]);
  }, []);

  const updateEnvVar = useCallback((rowId: string, updates: Partial<LocalEnvVarFormValue>) => {
    setEnvVarRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...updates } : row)));
  }, []);

  const removeEnvVar = useCallback((rowId: string) => {
    setEnvVarRows((prev) => prev.filter((row) => row.id !== rowId));
  }, []);

  const envVarNameErrors = useMemo(
    () =>
      envVarRows.map((row) => {
        const trimmed = row.name.trim();
        if (trimmed.length === 0) {
          return "Variable name is required.";
        }
        if (!ENV_VAR_NAME_REGEX.test(trimmed)) {
          return "Use A-Z, 0-9, and _. First character must be a letter or _.";
        }
        return null;
      }),
    [envVarRows]
  );

  const nameError = !name.trim() ? "Name is required." : null;
  const executableError = !executable.trim() ? "Executable is required." : null;
  const hasErrors = Boolean(nameError || executableError) || envVarNameErrors.some(Boolean);

  const handleBrowseExecutable = useCallback(() => {
    void (async () => {
      const filePath = await window.hypershell?.fsShowOpenDialog?.({
        title: "Select Executable",
        filters: [{ name: "Executable", extensions: ["exe"] }]
      });
      if (filePath) {
        setExecutable(filePath);
      }
    })();
  }, []);

  const handleBrowseStartingDirectory = useCallback(() => {
    void (async () => {
      const dirPath = await window.hypershell?.fsShowOpenDialog?.({
        title: "Select Starting Directory",
        directory: true
      });
      if (dirPath) {
        setStartingDirectory(dirPath);
      }
    })();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched({ name: true, executable: true });
      if (hasErrors) {
        return;
      }

      const input: UpsertLocalProfileRequest = {
        id,
        name: name.trim(),
        executable: executable.trim(),
        args: parseArgs(argsText),
        startingDirectory: startingDirectory.trim() || null,
        icon,
        color,
        claudeSession,
        claudeSessionMode,
        ...(shouldIncludeEnvVarsInUpsert(!profile, envVarsLoaded)
          ? {
              envVars: envVarRows.map((row) => ({
                name: row.name.trim(),
                value: row.value,
                isEnabled: row.isEnabled
              }))
            }
          : {})
      };

      setFormError(null);
      setSubmitting(true);
      void localProfilesStore
        .getState()
        .save(input)
        .then(() => {
          onSave(input);
        })
        .catch((error: unknown) => {
          setFormError(
            isUniqueNameConflict(error)
              ? `A profile named "${input.name}" already exists.`
              : error instanceof Error
                ? error.message
                : "Failed to save profile."
          );
        })
        .finally(() => setSubmitting(false));
    },
    [
      argsText,
      claudeSession,
      claudeSessionMode,
      color,
      envVarRows,
      envVarsLoaded,
      executable,
      hasErrors,
      icon,
      id,
      name,
      onSave,
      profile,
      startingDirectory
    ]
  );

  const handleDelete = useCallback(() => {
    if (!profile) return;
    setFormError(null);
    setDeleting(true);
    void localProfilesStore
      .getState()
      .remove(profile.id)
      .then(() => onDelete?.(profile.id))
      .catch((error: unknown) => {
        setFormError(error instanceof Error ? error.message : "Failed to delete profile.");
      })
      .finally(() => setDeleting(false));
  }, [onDelete, profile]);

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <label htmlFor={`${formId}-name`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Name</span>
        <input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          required
          className={inputClasses}
        />
        {touched.name && nameError && <span className="text-xs text-red-400">{nameError}</span>}
      </label>

      <label htmlFor={`${formId}-executable`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Executable</span>
        <div className="flex gap-1.5">
          <input
            id={`${formId}-executable`}
            value={executable}
            onChange={(e) => setExecutable(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, executable: true }))}
            placeholder="pwsh.exe"
            required
            className={`${inputClasses} flex-1`}
          />
          <button
            type="button"
            onClick={handleBrowseExecutable}
            className="shrink-0 rounded-md border border-border bg-base-800 px-2.5 hover:bg-base-700 text-text-muted hover:text-text-primary transition-colors"
            title="Browse for executable"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 13h12M8 3v7M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {touched.executable && executableError && (
          <span className="text-xs text-red-400">{executableError}</span>
        )}
      </label>

      <label htmlFor={`${formId}-args`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Arguments</span>
        <input
          id={`${formId}-args`}
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          placeholder="-NoLogo"
          className={inputClasses}
        />
        <span className="text-xs text-text-muted/70">
          Leave empty so the shell loads your own profile.
        </span>
      </label>

      <label htmlFor={`${formId}-startingDirectory`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Starting Directory</span>
        <div className="flex gap-1.5">
          <input
            id={`${formId}-startingDirectory`}
            value={startingDirectory}
            onChange={(e) => setStartingDirectory(e.target.value)}
            placeholder="Leave empty to inherit"
            className={`${inputClasses} flex-1`}
          />
          <button
            type="button"
            onClick={handleBrowseStartingDirectory}
            className="shrink-0 rounded-md border border-border bg-base-800 px-2.5 hover:bg-base-700 text-text-muted hover:text-text-primary transition-colors"
            title="Browse for starting directory"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 13h12M8 3v7M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </label>

      <label htmlFor={`${formId}-claudeSession`} className="flex items-start gap-2">
        <input
          id={`${formId}-claudeSession`}
          type="checkbox"
          checked={claudeSession}
          onChange={(e) => setClaudeSession(e.target.checked)}
          className="mt-0.5 accent-accent"
        />
        <span className="grid gap-0.5">
          <span className="text-xs font-medium text-text-secondary">Claude Code session</span>
          <span className="text-[11px] text-text-muted">
            Reopens a previous conversation instead of starting cold.
          </span>
        </span>
      </label>

      {claudeSession && (
        <div className="grid gap-1.5 pl-6">
          <span className="text-xs font-medium text-text-secondary" id={`${formId}-claudeMode-label`}>
            Which conversation
          </span>
          <div className="grid gap-2" role="radiogroup" aria-labelledby={`${formId}-claudeMode-label`}>
            <label htmlFor={`${formId}-claudeMode-continue`} className="flex items-start gap-2">
              <input
                id={`${formId}-claudeMode-continue`}
                type="radio"
                name={`${formId}-claudeMode`}
                checked={claudeSessionMode === "continue"}
                onChange={() => setClaudeSessionMode("continue")}
                className="mt-0.5 accent-accent"
              />
              <span className="grid gap-0.5">
                <span className="text-xs text-text-primary">Most recent in this folder</span>
                <span className="text-[11px] text-text-muted">
                  Runs <code>--continue</code>. Picks up the latest conversation for the
                  working directory even if you started it by typing{" "}
                  <code>claude</code> in a shell.
                </span>
              </span>
            </label>
            <label htmlFor={`${formId}-claudeMode-new`} className="flex items-start gap-2">
              <input
                id={`${formId}-claudeMode-new`}
                type="radio"
                name={`${formId}-claudeMode`}
                checked={claudeSessionMode === "new"}
                onChange={() => setClaudeSessionMode("new")}
                className="mt-0.5 accent-accent"
              />
              <span className="grid gap-0.5">
                <span className="text-xs text-text-primary">This tab&apos;s own conversation</span>
                <span className="text-[11px] text-text-muted">
                  Each tab gets a private conversation that only it resumes. Use this
                  when you run more than one Claude tab in the same folder.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary" id={`${formId}-icon-label`}>
          Icon
        </span>
        <div className="flex gap-1.5" role="group" aria-labelledby={`${formId}-icon-label`}>
          {ICON_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={icon === option.key}
              aria-label={option.label}
              title={option.label}
              onClick={() => setIcon(option.key)}
              className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                icon === option.key
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border bg-base-800/70 text-text-muted hover:text-text-primary"
              }`}
            >
              <LocalProfileIcon icon={option.key} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary" id={`${formId}-color-label`}>
          Colour
        </span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`${formId}-color-label`}>
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={c.charAt(0).toUpperCase() + c.slice(1)}
              title={c.charAt(0).toUpperCase() + c.slice(1)}
              onClick={() => setColor(c)}
              className={`color-swatch color-swatch-${c} h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                color === c ? "ring-2 ring-white/70 ring-offset-1 ring-offset-base-800" : ""
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => setColor(null)}
            aria-label="Clear colour"
            title="Clear colour"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid gap-3 pt-2 border-t border-border/40">
        <details open className="grid gap-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Environment Variables
          </summary>
          {envVarsKnown ? (
            <>
              <span className="text-xs text-text-muted/70">
                Variables are applied when opening this local shell.
              </span>

              {envVarRows.length === 0 ? (
                <p className="text-xs text-text-muted/70">No variables configured.</p>
              ) : (
                <div className="grid gap-2">
                  {envVarRows.map((row, index) => (
                    <div key={row.id} className="grid gap-2 rounded-lg border border-border/60 bg-surface/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                          Variable {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEnvVar(row.id)}
                          className="rounded border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <label className="sr-only" htmlFor={`${formId}-envVar-${row.id}-name`}>
                          Variable {index + 1} name
                        </label>
                        <input
                          id={`${formId}-envVar-${row.id}-name`}
                          value={row.name}
                          onChange={(e) => updateEnvVar(row.id, { name: e.target.value })}
                          placeholder="NAME"
                          className={inputClasses}
                        />
                        <label className="sr-only" htmlFor={`${formId}-envVar-${row.id}-value`}>
                          Variable {index + 1} value
                        </label>
                        <input
                          id={`${formId}-envVar-${row.id}-value`}
                          value={row.value}
                          onChange={(e) => updateEnvVar(row.id, { value: e.target.value })}
                          placeholder="value"
                          className={inputClasses}
                        />
                        <label className="flex items-center gap-2 px-1 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={row.isEnabled}
                            onChange={(e) => updateEnvVar(row.id, { isEnabled: e.target.checked })}
                            className="rounded border-border accent-accent"
                          />
                          Enabled
                        </label>
                      </div>

                      {envVarNameErrors[index] && (
                        <span className="text-xs text-red-400">{envVarNameErrors[index]}</span>
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
            </>
          ) : (
            <p className="text-xs text-amber-400">
              Existing environment variables could not be loaded, so they will be left unchanged when you save.
            </p>
          )}
        </details>
      </div>

      {formError && <p className="text-xs text-red-400">{formError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={hasErrors || submitting}
          className={`justify-self-start rounded-lg px-5 py-2 text-sm font-medium transition-all duration-150 ${
            hasErrors || submitting
              ? "bg-surface/50 border border-border text-text-muted cursor-not-allowed"
              : "bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 hover:border-accent/40 active:bg-accent/30"
          }`}
        >
          {submitting ? "Saving..." : profile ? "Update profile" : "Add profile"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-surface/50 px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary hover:bg-base-700/60"
        >
          Cancel
        </button>

        {profile && onDelete && (
          <div className="ml-auto flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            {isDetected && (
              <span className="text-[11px] text-text-muted/70 text-right max-w-[220px]">
                Deleting hides this detected profile — a rescan would otherwise recreate it.
              </span>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
