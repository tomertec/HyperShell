import { beforeEach, describe, expect, it } from "vitest";

import { createHostFingerprintRepositoryFromDatabase } from "./hostFingerprintRepository";
import { openDatabase, type SqliteDatabase } from "../index";

describe("HostFingerprintRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createHostFingerprintRepositoryFromDatabase>;

  beforeEach(() => {
    db = openDatabase();
    repo = createHostFingerprintRepositoryFromDatabase(db);
  });

  it("upserts and retrieves a fingerprint", () => {
    const record = repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abcdef123456",
    });

    expect(record.hostname).toBe("example.com");
    expect(record.port).toBe(22);
    expect(record.algorithm).toBe("ssh-ed25519");
    expect(record.fingerprint).toBe("SHA256:abcdef123456");
    expect(record.isTrusted).toBe(false);
    expect(record.firstSeen).toBeDefined();
    expect(record.lastSeen).toBeDefined();
  });

  it("finds fingerprint by host and algorithm", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abcdef123456",
    });

    const found = repo.findByHostAndAlgorithm("example.com", 22, "ssh-ed25519");
    expect(found).toBeDefined();
    expect(found?.fingerprint).toBe("SHA256:abcdef123456");
  });

  it("returns undefined for unknown host", () => {
    const found = repo.findByHostAndAlgorithm("unknown.com", 22, "ssh-ed25519");
    expect(found).toBeUndefined();
  });

  it("finds all fingerprints by host", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:aaa",
    });
    repo.upsert({
      id: "fp-2",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-rsa",
      fingerprint: "SHA256:bbb",
    });

    const results = repo.findByHost("example.com", 22);
    expect(results).toHaveLength(2);
  });

  it("trusts a fingerprint", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abcdef123456",
    });

    const trusted = repo.trust("fp-1");
    expect(trusted).toBe(true);

    const found = repo.findByHostAndAlgorithm("example.com", 22, "ssh-ed25519");
    expect(found?.isTrusted).toBe(true);
  });

  it("trust returns false for nonexistent id", () => {
    const result = repo.trust("nonexistent");
    expect(result).toBe(false);
  });

  it("updates fingerprint on conflict (same host/port/algorithm)", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:old",
    });
    repo.trust("fp-1");

    // Upsert with new id but same hostname/port/algorithm should update
    repo.upsert({
      id: "fp-2",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:new",
    });

    const found = repo.findByHostAndAlgorithm("example.com", 22, "ssh-ed25519");
    expect(found?.fingerprint).toBe("SHA256:new");
    // The original row id is preserved due to ON CONFLICT
    expect(found?.id).toBe("fp-1");
  });

  it("removes a fingerprint by id", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abcdef123456",
    });

    const result = repo.remove("fp-1");
    expect(result).toBe(true);

    const found = repo.findByHostAndAlgorithm("example.com", 22, "ssh-ed25519");
    expect(found).toBeUndefined();
  });

  it("remove returns false for nonexistent id", () => {
    const result = repo.remove("nonexistent");
    expect(result).toBe(false);
  });

  it("removes all fingerprints for a host", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:aaa",
    });
    repo.upsert({
      id: "fp-2",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-rsa",
      fingerprint: "SHA256:bbb",
    });

    const result = repo.removeByHost("example.com", 22);
    expect(result).toBe(true);

    const remaining = repo.findByHost("example.com", 22);
    expect(remaining).toHaveLength(0);
  });

  it("distinguishes fingerprints by port", () => {
    repo.upsert({
      id: "fp-1",
      hostname: "example.com",
      port: 22,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:port22",
    });
    repo.upsert({
      id: "fp-2",
      hostname: "example.com",
      port: 2222,
      algorithm: "ssh-ed25519",
      fingerprint: "SHA256:port2222",
    });

    const fp22 = repo.findByHostAndAlgorithm("example.com", 22, "ssh-ed25519");
    const fp2222 = repo.findByHostAndAlgorithm("example.com", 2222, "ssh-ed25519");
    expect(fp22?.fingerprint).toBe("SHA256:port22");
    expect(fp2222?.fingerprint).toBe("SHA256:port2222");
  });
});
