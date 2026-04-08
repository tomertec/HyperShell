import type { SavedSessionRecord } from "@sshterm/shared";

import { Modal } from "../layout/Modal";

function formatSavedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatTransport(transport: SavedSessionRecord["transport"]): string {
  if (transport === "ssh") {
    return "SSH";
  }
  if (transport === "serial") {
    return "Serial";
  }
  return "SFTP";
}

export interface SessionRecoveryDialogProps {
  open: boolean;
  sessions: SavedSessionRecord[];
  onRestore: () => void | Promise<void>;
  onDismiss: () => void | Promise<void>;
}

export function SessionRecoveryDialog({
  open,
  sessions,
  onRestore,
  onDismiss,
}: SessionRecoveryDialogProps) {
  return (
    <Modal open={open} onClose={onDismiss} title="Restore Previous Sessions">
      <div className="grid gap-4">
        <p className="text-xs text-text-muted">
          SSHTerm detected sessions from an ungraceful shutdown. Restore the
          previous tab set?
        </p>

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-base-900/80">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Transport</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-border/70">
                  <td className="px-3 py-2 text-text-primary">{session.title}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatTransport(session.transport)}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {session.hostName ?? session.profileId}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatSavedAt(session.savedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border bg-base-700/60 px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            onClick={() => void onDismiss()}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent/15 border border-accent/30 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/25 hover:border-accent/40"
            onClick={() => void onRestore()}
          >
            Restore All
          </button>
        </div>
      </div>
    </Modal>
  );
}
