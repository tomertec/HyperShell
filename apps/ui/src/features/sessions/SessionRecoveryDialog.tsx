import type { SavedSessionRecord } from "@hypershell/shared";

import { Modal } from "../layout/Modal";
import { resolveSavedSessionLabels, savedSessionTarget } from "./savedSessionLabels";

function formatSavedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

const TRANSPORT_LABELS: Record<SavedSessionRecord["transport"], string> = {
  ssh: "SSH",
  serial: "Serial",
  sftp: "SFTP",
  telnet: "Telnet",
  local: "Local",
};

export function formatTransport(transport: SavedSessionRecord["transport"]): string {
  return TRANSPORT_LABELS[transport];
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
  const labels = resolveSavedSessionLabels(sessions);

  return (
    <Modal
      open={open}
      onClose={() => { void onDismiss(); }}
      title="Restore Previous Sessions"
      footer={
        <>
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
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-xs text-text-muted">
          HyperShell detected sessions from an ungraceful shutdown. Restore the
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
              {sessions.map((session, index) => (
                <tr key={session.id} className="border-t border-border/70">
                  <td className="px-3 py-2 text-text-primary">{labels[index]}</td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatTransport(session.transport)}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {savedSessionTarget(session)}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatSavedAt(session.savedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
