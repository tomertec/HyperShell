import { useCallback, useEffect, useState } from "react";
import type { PuttySession } from "@sshterm/shared";

export interface PuttyImportDialogProps {
  onImport: (sessions: PuttySession[]) => void;
  onClose: () => void;
}

export function PuttyImportDialog({ onImport, onClose }: PuttyImportDialogProps) {
  const [sessions, setSessions] = useState<PuttySession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function scan() {
      try {
        const result = await window.sshterm?.scanPuttySessions?.();
        if (cancelled) return;
        if (!result || result.sessions.length === 0) {
          setError("No PuTTY SSH sessions found in the Windows registry.");
          setLoading(false);
          return;
        }
        setSessions(result.sessions);
        setSelected(new Set(result.sessions.map((s) => s.name)));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to scan PuTTY sessions."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void scan();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSession = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === sessions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map((s) => s.name)));
    }
  }, [selected.size, sessions]);

  const handleImport = useCallback(() => {
    const toImport = sessions.filter((s) => selected.has(s.name));
    onImport(toImport);
  }, [sessions, selected, onImport]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-text-secondary">
          Scanning PuTTY sessions...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-text-secondary">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="justify-self-start rounded-lg border border-border bg-base-700/40 px-4 py-2 text-sm font-medium text-text-primary hover:bg-base-700/60 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const selectedCount = selected.size;
  const allSelected = selectedCount === sessions.length;

  return (
    <div className="grid gap-4">
      <p className="text-xs text-text-secondary">
        Found {sessions.length} PuTTY SSH session{sessions.length === 1 ? "" : "s"} in the Windows registry.
        Select the sessions you want to import as HyperShell hosts.
      </p>

      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary transition-colors">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-border"
          />
          Select all
        </label>
        <span className="text-text-muted">
          ({selectedCount} of {sessions.length} selected)
        </span>
      </div>

      <div className="grid gap-1.5 max-h-64 overflow-y-auto">
        {sessions.map((session) => (
          <label
            key={session.name}
            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-base-900 text-sm cursor-pointer hover:bg-base-800/60 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(session.name)}
              onChange={() => toggleSession(session.name)}
              className="rounded border-border"
            />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-text-primary">{session.name}</span>
              <div className="text-text-muted text-xs truncate">
                {session.username ? `${session.username}@` : ""}
                {session.hostname}
                {session.port !== 22 ? `:${session.port}` : ""}
                {session.keyFile ? ` \u00b7 ${session.keyFile}` : ""}
              </div>
            </div>
          </label>
        ))}
      </div>

      <button
        type="button"
        disabled={selectedCount === 0}
        onClick={handleImport}
        className="justify-self-start rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Import {selectedCount} session{selectedCount === 1 ? "" : "s"}
      </button>
    </div>
  );
}
