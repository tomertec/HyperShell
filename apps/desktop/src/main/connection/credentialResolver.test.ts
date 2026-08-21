import { describe, expect, it, vi } from "vitest";
import type { HostRecord as DbHostRecord } from "@hypershell/db";

import {
  createCredentialResolver,
  type CredentialResolverDeps,
  type HostLookup
} from "./credentialResolver";

function makeHost(overrides: Partial<DbHostRecord> = {}): DbHostRecord {
  return {
    id: "host-1",
    name: "docker",
    hostname: "10.10.10.20",
    port: 22,
    username: "tomer",
    identityFile: null,
    hostProfileId: null,
    authProfileId: null,
    groupId: null,
    notes: null,
    authMethod: "default",
    agentKind: "default",
    opReference: null,
    isFavorite: false,
    sortOrder: null,
    color: null,
    proxyJump: null,
    proxyJumpHostIds: null,
    keepAliveInterval: null,
    autoReconnect: false,
    reconnectMaxAttempts: 5,
    reconnectBaseInterval: 1000,
    tmuxDetect: false,
    shellIntegration: true,
    ...overrides
  };
}

function makeDeps(
  hosts: DbHostRecord[],
  overrides: Partial<CredentialResolverDeps> = {}
): CredentialResolverDeps {
  const lookup: HostLookup = {
    get: (id) => hosts.find((host) => host.id === id),
    list: () => hosts
  };

  return {
    hosts: () => lookup,
    readStoredPassword: () => null,
    readOnePasswordReference: () => Promise.resolve(""),
    readCachedCredential: () => null,
    credentialCacheConfig: () => ({ enabled: false, ttlMs: 0 }),
    trace: () => {},
    ...overrides
  };
}

describe("findHost", () => {
  const host = makeHost();

  it("resolves by id, name and hostname for both transports", () => {
    const resolver = createCredentialResolver(makeDeps([host]));

    for (const matchDestination of [true, false]) {
      expect(resolver.findHost("host-1", { matchDestination })?.id).toBe("host-1");
      expect(resolver.findHost("docker", { matchDestination })?.id).toBe("host-1");
      expect(resolver.findHost("10.10.10.20", { matchDestination })?.id).toBe("host-1");
    }
  });

  // Characterization: the SSH path accepts a `user@hostname` destination (Quick
  // Connect builds exactly that form); the SFTP path does not. Pass 2 unifies
  // this by making matchDestination unconditional.
  it("matches a user@hostname destination only when asked to", () => {
    const resolver = createCredentialResolver(makeDeps([host]));

    expect(
      resolver.findHost("tomer@10.10.10.20", { matchDestination: true })?.id
    ).toBe("host-1");
    expect(
      resolver.findHost("tomer@10.10.10.20", { matchDestination: false })
    ).toBeNull();
  });

  it("returns null for an unknown profileId", () => {
    const resolver = createCredentialResolver(makeDeps([host]));

    expect(resolver.findHost("nope", { matchDestination: true })).toBeNull();
  });

  it("returns null when the hosts repository is unavailable", () => {
    const resolver = createCredentialResolver(
      makeDeps([host], { hosts: () => null })
    );

    expect(resolver.findHost("host-1", { matchDestination: true })).toBeNull();
  });
});

describe("resolvePassword", () => {
  it("short-circuits on an explicitly supplied password", async () => {
    const readStoredPassword = vi.fn(() => "from-storage");
    const resolver = createCredentialResolver(
      makeDeps([], { readStoredPassword })
    );

    const password = await resolver.resolvePassword(
      makeHost({ authMethod: "password", authProfileId: "auth-1" }),
      { transport: "sftp", existing: "typed-by-user" }
    );

    expect(password).toBe("typed-by-user");
    expect(readStoredPassword).not.toHaveBeenCalled();
  });

  it("reads a saved password from secure storage when authMethod is password", async () => {
    const resolver = createCredentialResolver(
      makeDeps([], { readStoredPassword: () => "stored" })
    );

    const password = await resolver.resolvePassword(
      makeHost({ authMethod: "password", authProfileId: "auth-1" }),
      { transport: "ssh" }
    );

    expect(password).toBe("stored");
  });

  it("resolves a 1Password reference when authMethod is op-reference", async () => {
    const readOnePasswordReference = vi.fn(() => Promise.resolve("from-1password"));
    const resolver = createCredentialResolver(
      makeDeps([], { readOnePasswordReference })
    );

    const password = await resolver.resolvePassword(
      makeHost({ authMethod: "op-reference", opReference: "op://vault/item/password" }),
      { transport: "ssh" }
    );

    expect(password).toBe("from-1password");
    expect(readOnePasswordReference).toHaveBeenCalledWith("op://vault/item/password");
  });

  it("yields undefined for the default auth method", async () => {
    const resolver = createCredentialResolver(makeDeps([]));

    await expect(
      resolver.resolvePassword(makeHost(), { transport: "ssh" })
    ).resolves.toBeUndefined();
  });

  // Characterization: only the SFTP path passes cacheLookup today, so only SFTP
  // consults the credential cache. Pass 2 unifies this by having the SSH path
  // pass cacheLookup too.
  it("consults the credential cache only when cacheLookup is supplied", async () => {
    const readCachedCredential = vi.fn(() => "cached");
    const deps = makeDeps([], {
      readCachedCredential,
      credentialCacheConfig: () => ({ enabled: true, ttlMs: 60_000 })
    });
    const resolver = createCredentialResolver(deps);
    const host = makeHost({ authMethod: "password", authProfileId: "auth-1" });

    await expect(
      resolver.resolvePassword(host, { transport: "ssh" })
    ).resolves.toBeUndefined();
    expect(readCachedCredential).not.toHaveBeenCalled();

    await expect(
      resolver.resolvePassword(host, {
        transport: "sftp",
        cacheLookup: { hostname: "10.10.10.20", port: 22, username: "tomer" }
      })
    ).resolves.toBe("cached");
  });

  it("skips the cache when it is disabled in settings", async () => {
    const readCachedCredential = vi.fn(() => "cached");
    const resolver = createCredentialResolver(
      makeDeps([], {
        readCachedCredential,
        credentialCacheConfig: () => ({ enabled: false, ttlMs: 0 })
      })
    );

    await expect(
      resolver.resolvePassword(makeHost(), {
        transport: "sftp",
        cacheLookup: { hostname: "10.10.10.20", port: 22, username: "tomer" }
      })
    ).resolves.toBeUndefined();
    expect(readCachedCredential).not.toHaveBeenCalled();
  });

  it("prefers the cache over secure storage", async () => {
    const readStoredPassword = vi.fn(() => "stored");
    const resolver = createCredentialResolver(
      makeDeps([], {
        readStoredPassword,
        readCachedCredential: () => "cached",
        credentialCacheConfig: () => ({ enabled: true, ttlMs: 60_000 })
      })
    );

    const password = await resolver.resolvePassword(
      makeHost({ authMethod: "password", authProfileId: "auth-1" }),
      {
        transport: "sftp",
        cacheLookup: { hostname: "10.10.10.20", port: 22, username: "tomer" }
      }
    );

    expect(password).toBe("cached");
    expect(readStoredPassword).not.toHaveBeenCalled();
  });

  it("survives a throwing secure-storage read", async () => {
    const resolver = createCredentialResolver(
      makeDeps([], {
        readStoredPassword: () => {
          throw new Error("DPAPI unavailable");
        }
      })
    );

    await expect(
      resolver.resolvePassword(
        makeHost({ authMethod: "password", authProfileId: "auth-1" }),
        { transport: "ssh" }
      )
    ).resolves.toBeUndefined();
  });

  it("survives a throwing 1Password lookup", async () => {
    const resolver = createCredentialResolver(
      makeDeps([], {
        readOnePasswordReference: () =>
          Promise.reject(new Error("op CLI not signed in"))
      })
    );

    await expect(
      resolver.resolvePassword(
        makeHost({ authMethod: "op-reference", opReference: "op://v/i/p" }),
        { transport: "ssh" }
      )
    ).resolves.toBeUndefined();
  });

  it("yields undefined when there is no host record", async () => {
    const resolver = createCredentialResolver(makeDeps([]));

    await expect(
      resolver.resolvePassword(null, { transport: "ssh" })
    ).resolves.toBeUndefined();
  });
});
