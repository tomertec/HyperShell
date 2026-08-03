import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SshManagerHost, SshManagerGroup, SshManagerSnippet } from "@hypershell/shared";
import { Modal } from "../layout/Modal";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/SectionLabel";

export interface SshManagerImportDialogProps {
  open: boolean;
  onImported: () => void;
  onClose: () => void;
}

export function SshManagerImportDialog({ open, onImported, onClose }: SshManagerImportDialogProps) {
  const [hosts, setHosts] = useState<SshManagerHost[]>([]);
  const [groups, setGroups] = useState<SshManagerGroup[]>([]);
  const [snippets, setSnippets] = useState<SshManagerSnippet[]>([]);
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(() => new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());
  const [selectedSnippets, setSelectedSnippets] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The component stays mounted so the modal can animate out, so the database
  // scan is gated on `open` and resets first — one fresh scan per opening.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImporting(false);
    setHosts([]);
    setGroups([]);
    setSnippets([]);
    setSelectedHosts(new Set());
    setSelectedGroups(new Set());
    setSelectedSnippets(new Set());

    async function scan() {
      try {
        const result = await window.hypershell?.scanSshManager?.();
        if (cancelled) return;
        if (!result || (result.hosts.length === 0 && result.groups.length === 0 && result.snippets.length === 0)) {
          setError("No SshManager database found or it contains no data.");
          setLoading(false);
          return;
        }
        setHosts(result.hosts);
        setGroups(result.groups);
        setSnippets(result.snippets);
        setSelectedHosts(new Set(result.hosts.map((h) => h.id)));
        setSelectedGroups(new Set(result.groups.map((g) => g.id)));
        setSelectedSnippets(new Set(result.snippets.map((s) => s.id)));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to scan SshManager database.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void scan();
    return () => { cancelled = true; };
  }, [open]);

  const toggleHost = useCallback((id: string) => {
    setSelectedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSnippet = useCallback((id: string) => {
    setSelectedSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllHosts = useCallback(() => {
    if (selectedHosts.size === hosts.length) {
      setSelectedHosts(new Set());
    } else {
      setSelectedHosts(new Set(hosts.map((h) => h.id)));
    }
  }, [selectedHosts.size, hosts]);

  const toggleAllGroups = useCallback(() => {
    if (selectedGroups.size === groups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(groups.map((g) => g.id)));
    }
  }, [selectedGroups.size, groups]);

  const toggleAllSnippets = useCallback(() => {
    if (selectedSnippets.size === snippets.length) {
      setSelectedSnippets(new Set());
    } else {
      setSelectedSnippets(new Set(snippets.map((s) => s.id)));
    }
  }, [selectedSnippets.size, snippets]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const result = await window.hypershell?.importSshManager?.({
        hostIds: Array.from(selectedHosts),
        groupIds: Array.from(selectedGroups),
        snippetIds: Array.from(selectedSnippets),
      });
      if (result) {
        const parts: string[] = [];
        if (result.importedHosts > 0) parts.push(`${result.importedHosts} host${result.importedHosts === 1 ? "" : "s"}`);
        if (result.importedGroups > 0) parts.push(`${result.importedGroups} group${result.importedGroups === 1 ? "" : "s"}`);
        if (result.importedSnippets > 0) parts.push(`${result.importedSnippets} snippet${result.importedSnippets === 1 ? "" : "s"}`);
        if (result.skippedDuplicates > 0) parts.push(`${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"} skipped`);

        toast.success(`Imported ${parts.join(", ")}`);
      }
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [selectedHosts, selectedGroups, selectedSnippets, onImported]);

  const authTypeLabel = (authType: number): string => {
    switch (authType) {
      case 0: return "SSH Agent";
      case 1: return "Key File";
      case 2: return "Password";
      case 3: return "Kerberos";
      case 4: return "1Password";
      default: return "Default";
    }
  };

  const totalSelected = selectedHosts.size + selectedGroups.size + selectedSnippets.size;
  const hasPasswordHosts = hosts.some((h) => selectedHosts.has(h.id) && h.authType === 2);
  const scanFailed =
    error !== null && hosts.length === 0 && groups.length === 0 && snippets.length === 0;

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (loading) {
    body = (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-text-secondary">Scanning SshManager database...</span>
      </div>
    );
  } else if (scanFailed) {
    body = <p className="text-sm text-text-secondary">{error}</p>;
    footer = (
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    );
  } else {
    footer = (
      <Button variant="primary" disabled={totalSelected === 0 || importing} onClick={() => void handleImport()}>
        {importing ? "Importing..." : `Import ${totalSelected} item${totalSelected === 1 ? "" : "s"}`}
      </Button>
    );
    body = (
      <div className="grid gap-4">
        {/* Password warning */}
        {hasPasswordHosts && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Saved passwords from SshManager cannot be migrated (they use Windows DPAPI encryption).
            You will need to re-enter passwords or switch to 1Password references.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        {/* Groups */}
        {groups.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs mb-1.5">
              <SectionLabel>Groups ({groups.length})</SectionLabel>
              <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary transition-colors ml-auto">
                <input
                  type="checkbox"
                  checked={selectedGroups.size === groups.length}
                  onChange={toggleAllGroups}
                  className="rounded border-border"
                />
                All
              </label>
            </div>
            <div className="grid gap-1 max-h-32 overflow-y-auto">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-border bg-base-900 text-sm cursor-pointer hover:bg-base-800/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.has(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="rounded border-border"
                  />
                  <span className="font-medium text-text-primary">{group.name}</span>
                  {group.description && (
                    <span className="text-text-muted text-xs truncate">{group.description}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Hosts */}
        {hosts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs mb-1.5">
              <SectionLabel>Hosts ({hosts.length})</SectionLabel>
              <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary transition-colors ml-auto">
                <input
                  type="checkbox"
                  checked={selectedHosts.size === hosts.length}
                  onChange={toggleAllHosts}
                  className="rounded border-border"
                />
                All
              </label>
            </div>
            <div className="grid gap-1 max-h-48 overflow-y-auto">
              {hosts.map((host) => (
                <label
                  key={host.id}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-border bg-base-900 text-sm cursor-pointer hover:bg-base-800/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedHosts.has(host.id)}
                    onChange={() => toggleHost(host.id)}
                    className="rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-text-primary">{host.displayName}</span>
                    <div className="text-text-muted text-xs truncate">
                      {host.username ? `${host.username}@` : ""}
                      {host.hostname}
                      {host.port !== 22 ? `:${host.port}` : ""}
                      {" "}&middot; {authTypeLabel(host.authType)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Snippets */}
        {snippets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-xs mb-1.5">
              <SectionLabel>Snippets ({snippets.length})</SectionLabel>
              <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary transition-colors ml-auto">
                <input
                  type="checkbox"
                  checked={selectedSnippets.size === snippets.length}
                  onChange={toggleAllSnippets}
                  className="rounded border-border"
                />
                All
              </label>
            </div>
            <div className="grid gap-1 max-h-32 overflow-y-auto">
              {snippets.map((snippet) => (
                <label
                  key={snippet.id}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-border bg-base-900 text-sm cursor-pointer hover:bg-base-800/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSnippets.has(snippet.id)}
                    onChange={() => toggleSnippet(snippet.id)}
                    className="rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-text-primary">{snippet.name}</span>
                    <div className="text-text-muted text-xs truncate font-mono">{snippet.command}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Import from SshManager" footer={footer}>
      {body}
    </Modal>
  );
}
