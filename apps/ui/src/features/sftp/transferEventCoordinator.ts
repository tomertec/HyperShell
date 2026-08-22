import type { SftpEvent } from "@hypershell/shared";

import { transferStore } from "./transferStore";
import { getShell } from "../../lib/shell";

/**
 * Single owner of the SFTP transfer event stream.
 *
 * The transfer store is global, so every component that subscribed to
 * `onSftpEvent` directly ended up writing the same state and firing its own
 * `sftpTransferList()` request — once per open SFTP tab, plus the popup. This
 * module installs exactly one bridge listener, performs the store writes once,
 * and fans out only what individual views actually need:
 *
 *  - `subscribeToDirectoryInvalidation` — per-session, fires when a transfer
 *    that belongs to that SFTP session finishes successfully.
 *  - `subscribeToTransferEvents` — completion/conflict notifications for views
 *    that keep their own local UI state (the popup's conflict badges).
 */

export type CoordinatedTransferEvent = Extract<
  SftpEvent,
  { kind: "transfer-complete" } | { kind: "transfer-conflict" }
>;

type DirectoryInvalidationListener = () => void;
type TransferEventListener = (event: CoordinatedTransferEvent) => void;

const directoryListeners = new Map<string, Set<DirectoryInvalidationListener>>();
const transferEventListeners = new Set<TransferEventListener>();

let bridgeUnsubscribe: (() => void) | null = null;
let startCount = 0;

let refreshInFlight: Promise<void> | null = null;
let refreshQueued = false;

async function runRefresh(): Promise<void> {
  try {
    do {
      refreshQueued = false;
      const response = await getShell().sftpTransferList();
      if (response) {
        transferStore.getState().setTransfers(response.transfers);
      }
    } while (refreshQueued);
  } catch {
    // Ignore polling errors — the next event or poll cycle retries.
  } finally {
    refreshInFlight = null;
    refreshQueued = false;
  }
}

/**
 * Refetches the authoritative transfer list into the global store. Concurrent
 * callers share one in-flight request; a request that arrives while another is
 * running triggers exactly one follow-up refetch rather than queueing N.
 */
export function refreshTransfers(): Promise<void> {
  if (refreshInFlight) {
    refreshQueued = true;
    return refreshInFlight;
  }

  refreshInFlight = runRefresh();
  return refreshInFlight;
}

function notifyTransferEvent(event: CoordinatedTransferEvent): void {
  for (const listener of [...transferEventListeners]) {
    listener(event);
  }
}

function invalidateDirectories(sftpSessionId: string): void {
  const listeners = directoryListeners.get(sftpSessionId);
  if (!listeners) {
    return;
  }

  for (const listener of [...listeners]) {
    listener();
  }
}

function handleSftpEvent(event: SftpEvent): void {
  if (event.kind === "transfer-progress") {
    const state = transferStore.getState();
    state.clearConflict(event.transferId);
    const known = state.transfers.some(
      (transfer) => transfer.transferId === event.transferId
    );
    if (!known) {
      void refreshTransfers();
      return;
    }

    state.updateTransfer(event.transferId, {
      bytesTransferred: event.bytesTransferred,
      totalBytes: event.totalBytes,
      speed: event.speed,
      status: event.status
    });

    // The structured `userInitiated` flag rides only in the full job snapshot,
    // not in the progress event. Refetch on pause so the paused-by-user state
    // resolves deterministically (mirrors the transfer-complete refetch below).
    if (event.status === "paused") {
      void refreshTransfers();
    }
    return;
  }

  if (event.kind === "transfer-conflict") {
    const state = transferStore.getState();
    state.setConflict(event.transferId);
    state.setPanelOpen(true);
    // A filter left on "completed"/"failed"/"interrupted" would hide the
    // conflicted row entirely — with maxConcurrent: 1 that leaves the whole
    // queue blocked behind a transfer the user can neither see nor cancel.
    state.setFilter("all");
    void refreshTransfers();
    notifyTransferEvent(event);
    return;
  }

  if (event.kind === "transfer-complete") {
    const state = transferStore.getState();
    state.clearConflict(event.transferId);
    const known = state.transfers.some(
      (transfer) => transfer.transferId === event.transferId
    );
    if (known) {
      state.updateTransfer(event.transferId, {
        status: event.status,
        error: event.error
      });
    }

    // Directory parent jobs can complete before child jobs are known to the UI.
    // Refreshing here pulls newly enqueued child jobs immediately.
    void refreshTransfers();
    notifyTransferEvent(event);

    if (event.status === "completed") {
      invalidateDirectories(event.sftpSessionId);
    }
  }
}

/**
 * Installs the single application-level transfer event listener. Call once
 * from the app root; the returned function tears it down. Reference counted so
 * a StrictMode remount does not drop the live subscription.
 */
export function startTransferEventCoordinator(): () => void {
  startCount += 1;

  if (startCount === 1) {
    bridgeUnsubscribe = getShell().onSftpEvent(handleSftpEvent) ?? null;
    void refreshTransfers();
  }

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    startCount -= 1;

    if (startCount === 0) {
      bridgeUnsubscribe?.();
      bridgeUnsubscribe = null;
    }
  };
}

/**
 * Subscribes to directory-invalidation notifications for one SFTP session.
 * Fires only for transfers that belong to that session and completed
 * successfully, so unrelated tabs never re-list their directories.
 */
export function subscribeToDirectoryInvalidation(
  sftpSessionId: string,
  listener: DirectoryInvalidationListener
): () => void {
  let listeners = directoryListeners.get(sftpSessionId);
  if (!listeners) {
    listeners = new Set();
    directoryListeners.set(sftpSessionId, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = directoryListeners.get(sftpSessionId);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      directoryListeners.delete(sftpSessionId);
    }
  };
}

/** Subscribes to completion/conflict events after the store has been updated. */
export function subscribeToTransferEvents(listener: TransferEventListener): () => void {
  transferEventListeners.add(listener);
  return () => {
    transferEventListeners.delete(listener);
  };
}

/** Test-only reset of module-level state. */
export function __resetTransferEventCoordinatorForTests(): void {
  bridgeUnsubscribe?.();
  bridgeUnsubscribe = null;
  startCount = 0;
  refreshInFlight = null;
  refreshQueued = false;
  directoryListeners.clear();
  transferEventListeners.clear();
}
