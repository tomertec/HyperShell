import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { settingsStore } from "../../settings/settingsStore";
import { transferStore } from "../transferStore";
import { TransferPanel } from "./TransferPanel";

function pausedTransfer(transferId: string, userInitiated: boolean) {
  return {
    transferId,
    sftpSessionId: "s1",
    type: "upload",
    localPath: "/l/f",
    remotePath: "/r/f",
    bytesTransferred: 5,
    totalBytes: 10,
    speed: 0,
    status: "paused",
    userInitiated
  } as never;
}

describe("TransferPanel", () => {
  beforeEach(() => {
    // TransferPanel returns null when this is true; assert the default explicitly
    // rather than relying on it, per the settings-flag note in the task brief.
    settingsStore.setState((state) => ({
      settings: { ...state.settings, general: { ...state.settings.general, usePopupTransferMonitor: false } }
    }));
    transferStore.getState().setTransfers([]);
    for (const id of [...transferStore.getState().conflictIds]) {
      transferStore.getState().clearConflict(id);
    }
    transferStore.getState().setPanelOpen(true);
  });

  it("offers conflict resolution for a conflicted transfer", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);
    transferStore.getState().setConflict("t1");

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: "Overwrite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("does not offer Resume for a transfer paused by the system", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);

    render(<TransferPanel />);

    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("offers Resume for a transfer the user paused", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", true)]);

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("stays reachable after closing while a paused transfer remains", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);
    transferStore.getState().setPanelOpen(false);

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: /Transfers/ })).toBeTruthy();
  });
});
