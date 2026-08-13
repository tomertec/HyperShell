import type { TransferJob } from "@hypershell/shared";

export interface TransferRowControls {
  conflict: boolean;
  pause: boolean;
  resume: boolean;
  cancel: boolean;
  retry: boolean;
}

const NONE: TransferRowControls = {
  conflict: false,
  pause: false,
  resume: false,
  cancel: false,
  retry: false
};

/**
 * Which controls a transfer row may offer, shared by both transfer monitors
 * so they can no longer disagree. A system-paused transfer (waiting on a
 * conflict decision, `userInitiated` not `true`) must not offer Resume — the
 * backend rejects it with "Transfer is waiting for conflict resolution".
 */
export function transferRowControls(
  transfer: Pick<TransferJob, "status" | "userInitiated" | "bytesTransferred">,
  hasConflict: boolean
): TransferRowControls {
  if (hasConflict) {
    return { ...NONE, conflict: true };
  }

  if (transfer.status === "active" || transfer.status === "queued") {
    return { ...NONE, pause: true, cancel: true };
  }

  if (transfer.status === "paused") {
    if (transfer.userInitiated === true) {
      return { ...NONE, resume: true, cancel: true };
    }
    return { ...NONE, cancel: true };
  }

  if (transfer.status === "interrupted" || transfer.status === "failed") {
    return { ...NONE, retry: transfer.bytesTransferred > 0 };
  }

  return { ...NONE };
}
