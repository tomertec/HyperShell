import type { SavedSessionRecord } from "@hypershell/shared";
import { describe, expect, it } from "vitest";

import { resolveSavedSessionLabels } from "./savedSessionLabels";

function savedSession(
  overrides: Partial<SavedSessionRecord> & Pick<SavedSessionRecord, "id" | "title">
): SavedSessionRecord {
  return {
    hostId: null,
    hostName: null,
    transport: "local",
    profileId: "profile-1",
    wasGraceful: false,
    savedAt: "2026-08-17T04:33:10.000Z",
    claudeSessionId: null,
    ...overrides,
  };
}

describe("resolveSavedSessionLabels", () => {
  it("leaves a title that appears once unchanged", () => {
    const labels = resolveSavedSessionLabels([
      savedSession({ id: "session-1", title: "llmtop", profileId: "profile-a" }),
      savedSession({ id: "session-2", title: "PowerShell", profileId: "profile-b" }),
    ]);

    expect(labels).toEqual(["llmtop", "PowerShell"]);
  });

  it("numbers rows that are otherwise identical", () => {
    const labels = resolveSavedSessionLabels([
      savedSession({ id: "session-1", title: "PowerShell", profileId: "profile-b" }),
      savedSession({ id: "session-2", title: "PowerShell", profileId: "profile-b" }),
    ]);

    expect(labels).toEqual(["PowerShell (1)", "PowerShell (2)"]);
  });

  it("leaves a repeated title alone when the shown targets differ", () => {
    const labels = resolveSavedSessionLabels([
      savedSession({ id: "session-1", title: "PowerShell", profileId: "profile-a" }),
      savedSession({ id: "session-2", title: "PowerShell", profileId: "profile-b" }),
    ]);

    expect(labels).toEqual(["PowerShell", "PowerShell"]);
  });

  it("numbers each repeated group on its own", () => {
    const labels = resolveSavedSessionLabels([
      savedSession({ id: "session-1", title: "claude", profileId: "profile-a" }),
      savedSession({ id: "session-2", title: "PowerShell", profileId: "profile-b" }),
      savedSession({ id: "session-3", title: "claude", profileId: "profile-a" }),
      savedSession({ id: "session-4", title: "llmtop", profileId: "profile-c" }),
    ]);

    expect(labels).toEqual(["claude (1)", "PowerShell", "claude (2)", "llmtop"]);
  });
});
