import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveStoredHostPasswordMock = vi.fn(() => "saved-password");

const fakeHost = {
  id: "host-1",
  name: "host-1",
  hostname: "10.10.10.54",
  port: 22,
  username: "hermes",
  identityFile: null,
  authProfileId: "host-password-host-1",
  groupId: null,
  notes: null,
  authMethod: "password",
  agentKind: "system",
  opReference: null,
  isFavorite: false,
  sortOrder: null,
  color: null,
  proxyJump: null,
  proxyJumpHostIds: null,
  keepAliveInterval: null,
  autoReconnect: false,
  reconnectMaxAttempts: 5,
  reconnectBaseInterval: 1
};

vi.mock("./hostsIpc", () => ({
  registerHostIpc: vi.fn(),
  getOrCreateDatabase: vi.fn(() => null),
  getOrCreateHostsRepo: vi.fn(() => ({
    get: (id: string) => (id === fakeHost.id ? fakeHost : undefined),
    list: () => [fakeHost]
  })),
  resolveStoredHostPassword: resolveStoredHostPasswordMock
}));

describe("openSession password auth integration", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveStoredHostPasswordMock.mockClear();
  });

  it("injects saved password when host auth_method is password", async () => {
    const { openSessionForTestInspectInput } = await import("./registerIpc");

    const result = await openSessionForTestInspectInput({
      transport: "ssh",
      profileId: fakeHost.id,
      cols: 120,
      rows: 40
    }, {
      resolveHostProfile: null
    });

    expect(result.session.sessionId).toBeTruthy();
    expect(result.input?.sshOptions?.hostname).toBe(fakeHost.hostname);
    expect(result.input?.sshOptions?.password).toBe("saved-password");
    expect(resolveStoredHostPasswordMock).toHaveBeenCalledTimes(1);
  });
});
