import { describe, expect, it } from "vitest";
import type { SavedSessionRecord } from "@hypershell/shared";

import { isRestorableSavedSession, savedSessionToLayoutTab } from "./savedSessionRestore";

function record(overrides: Partial<SavedSessionRecord> = {}): SavedSessionRecord {
  return {
    id: "session-2",
    hostId: null,
    hostName: null,
    transport: "ssh",
    profileId: "host-1",
    title: "Production",
    wasGraceful: false,
    savedAt: "2026-08-13T15:23:38.906Z",
    claudeSessionId: null,
    ...overrides,
  };
}

describe("savedSessionToLayoutTab", () => {
  it("keeps a local session on the local transport", () => {
    const tab = savedSessionToLayoutTab(
      record({ transport: "local", profileId: "1f1f8716", title: "PowerShell" }),
      "recovery-1"
    );

    expect(tab).toMatchObject({
      sessionId: "recovery-1",
      transport: "local",
      profileId: "1f1f8716",
      title: "PowerShell",
    });
  });

  it("keeps ssh and serial sessions on their own transports", () => {
    expect(savedSessionToLayoutTab(record(), "recovery-1")?.transport).toBe("ssh");
    expect(
      savedSessionToLayoutTab(record({ transport: "serial", profileId: "COM3" }), "recovery-1")
        ?.transport
    ).toBe("serial");
  });

  it("carries the host id through for ssh sessions", () => {
    expect(
      savedSessionToLayoutTab(record({ hostId: "host-1" }), "recovery-1")?.hostId
    ).toBe("host-1");
  });

  it("refuses transports a saved row cannot reopen", () => {
    // SFTP: the session is a live ssh2 connection that died with the app.
    expect(savedSessionToLayoutTab(record({ transport: "sftp" }), "recovery-1")).toBeNull();
    // Telnet: the row carries no telnetOptions, so there is nothing to dial.
    expect(savedSessionToLayoutTab(record({ transport: "telnet" }), "recovery-1")).toBeNull();
  });
});

describe("isRestorableSavedSession", () => {
  it("agrees with savedSessionToLayoutTab for every transport", () => {
    // The dialog filters on this before listing rows; if the two ever
    // disagree, the dialog again promises rows Restore silently drops.
    const transports = ["ssh", "serial", "local", "sftp", "telnet"] as const;
    for (const transport of transports) {
      const session = record({ transport });
      expect(isRestorableSavedSession(session)).toBe(
        savedSessionToLayoutTab(session, "recovery-1") !== null
      );
    }
  });
});
