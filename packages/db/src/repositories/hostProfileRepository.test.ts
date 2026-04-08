import { beforeEach, describe, expect, it } from "vitest";

import {
  createHostProfileRepository,
  type HostProfileInput,
} from "./hostProfileRepository";

describe("hostProfileRepository", () => {
  let repo: ReturnType<typeof createHostProfileRepository>;

  const sampleInput: HostProfileInput = {
    id: "profile-1",
    name: "Default Linux",
    description: "Shared baseline for Linux hosts",
    defaultPort: 22,
    defaultUsername: "ubuntu",
    authMethod: "keyfile",
    identityFile: "~/.ssh/id_ed25519",
    proxyJump: "bastion",
    keepAliveInterval: 30,
  };

  beforeEach(() => {
    repo = createHostProfileRepository(":memory:");
  });

  it("creates and retrieves a host profile", () => {
    const created = repo.create(sampleInput);
    const found = repo.get(sampleInput.id);

    expect(created.id).toBe(sampleInput.id);
    expect(found).toBeDefined();
    expect(found?.name).toBe(sampleInput.name);
    expect(found?.defaultUsername).toBe(sampleInput.defaultUsername);
    expect(found?.authMethod).toBe(sampleInput.authMethod);
  });

  it("applies defaults when optional fields are omitted", () => {
    const created = repo.create({
      id: "profile-2",
      name: "Minimal",
    });

    expect(created.description).toBeNull();
    expect(created.defaultPort).toBe(22);
    expect(created.defaultUsername).toBeNull();
    expect(created.authMethod).toBe("default");
    expect(created.identityFile).toBeNull();
    expect(created.proxyJump).toBeNull();
    expect(created.keepAliveInterval).toBeNull();
  });

  it("upserts an existing host profile by id", () => {
    repo.create(sampleInput);

    const updated = repo.create({
      ...sampleInput,
      name: "Production Linux",
      defaultPort: 2222,
      defaultUsername: "admin",
    });

    expect(updated.name).toBe("Production Linux");
    expect(updated.defaultPort).toBe(2222);
    expect(updated.defaultUsername).toBe("admin");

    const all = repo.list();
    expect(all).toHaveLength(1);
  });

  it("lists profiles sorted by name", () => {
    repo.create({ id: "b", name: "z-profile" });
    repo.create({ id: "a", name: "a-profile" });

    const list = repo.list();
    expect(list.map((item) => item.name)).toEqual(["a-profile", "z-profile"]);
  });

  it("removes existing profiles and returns false for unknown ids", () => {
    repo.create(sampleInput);

    expect(repo.remove(sampleInput.id)).toBe(true);
    expect(repo.get(sampleInput.id)).toBeUndefined();
    expect(repo.remove("missing")).toBe(false);
  });
});
