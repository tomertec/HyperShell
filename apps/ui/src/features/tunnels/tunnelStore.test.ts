import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "../../lib/fakeShell";
import { setShell } from "../../lib/shell";
import { useTunnelStore } from "./tunnelStore";

afterEach(() => {
  setShell(null);
  useTunnelStore.setState({ activeForwards: [], selectedForwardId: null, showPanel: false });
});

describe("tunnelStore.refresh", () => {
  it("reads active forwards through the shell seam", async () => {
    const { shell } = createFakeShell({
      listPortForwards: vi.fn().mockResolvedValue([
        { id: "fwd-1", hostname: "db", localPort: 5432, remoteHost: "127.0.0.1", remotePort: 5432 },
      ]),
    });
    setShell(shell);

    await useTunnelStore.getState().refresh();

    expect(useTunnelStore.getState().activeForwards).toEqual([
      { status: "active", id: "fwd-1", hostname: "db", localPort: 5432, remoteHost: "127.0.0.1", remotePort: 5432 },
    ]);
  });

  it("leaves state untouched when the call resolves undefined (no bridge)", async () => {
    const { shell } = createFakeShell();
    setShell(shell);
    await useTunnelStore.getState().refresh();
    expect(useTunnelStore.getState().activeForwards).toEqual([]);
  });
});
