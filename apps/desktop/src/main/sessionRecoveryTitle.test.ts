import { describe, expect, it } from "vitest";

import { resolveSavedSessionTitle } from "./sessionRecoveryTitle";

describe("resolveSavedSessionTitle", () => {
  it("names an ssh session after its host", () => {
    expect(
      resolveSavedSessionTitle({ transport: "ssh", profileId: "host-1", hostName: "checkmk" })
    ).toBe("checkmk");
  });

  it("names a local session after its profile", () => {
    expect(
      resolveSavedSessionTitle({
        transport: "local",
        profileId: "1f1f8716-125c-476b-b355-99177abc70e9",
        localProfileName: "PowerShell",
      })
    ).toBe("PowerShell");
  });

  it("falls back to the profile id when nothing resolves", () => {
    expect(resolveSavedSessionTitle({ transport: "ssh", profileId: "10.10.10.60" })).toBe(
      "10.10.10.60"
    );
    expect(resolveSavedSessionTitle({ transport: "local", profileId: "deleted-profile" })).toBe(
      "deleted-profile"
    );
    expect(resolveSavedSessionTitle({ transport: "serial", profileId: "COM3" })).toBe("COM3");
  });
});
