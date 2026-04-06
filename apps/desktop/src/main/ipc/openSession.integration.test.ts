import { describe, expect, it } from "vitest";

import { openSessionForTest } from "./registerIpc";

describe("openSession integration", () => {
  it("returns a session id for ssh requests", async () => {
    const session = await openSessionForTest({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(session.sessionId).toBeTruthy();
  });
});
