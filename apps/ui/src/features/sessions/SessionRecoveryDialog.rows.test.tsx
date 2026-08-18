import type { SavedSessionRecord } from "@hypershell/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionRecoveryDialog } from "./SessionRecoveryDialog";

function localSession(id: string): SavedSessionRecord {
  return {
    id,
    hostId: null,
    hostName: null,
    transport: "local",
    profileId: "1f1f8716-125c-476b-b355-99177abc70e9",
    title: "PowerShell",
    wasGraceful: false,
    savedAt: "2026-08-17T04:33:10.000Z",
    claudeSessionId: null,
  };
}

describe("SessionRecoveryDialog", () => {
  it("tells two sessions of one profile apart", () => {
    render(
      <SessionRecoveryDialog
        open
        sessions={[localSession("session-6"), localSession("session-13")]}
        onRestore={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(screen.getByText("PowerShell (1)")).toBeTruthy();
    expect(screen.getByText("PowerShell (2)")).toBeTruthy();
  });
});
