import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKey, clearAll, get, set } from "./credentialCache";

describe("credentialCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
    clearAll();
  });

  afterEach(() => {
    clearAll();
    vi.useRealTimers();
  });

  it("builds a normalized key from host, port, and user", () => {
    expect(cacheKey("Example.COM", 22, " admin ")).toBe("example.com:22:admin");
  });

  it("returns a cached password before expiry", () => {
    set("host", 22, "user", "secret", 60_000);
    expect(get("host", 22, "user", 60_000)).toBe("secret");
  });

  it("expires and removes stale entries", () => {
    set("host", 22, "user", "secret", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(get("host", 22, "user", 1_000)).toBeNull();
  });

  it("extends ttl on read (sliding expiration)", () => {
    set("host", 22, "user", "secret", 1_000);
    vi.advanceTimersByTime(900);
    expect(get("host", 22, "user", 1_000)).toBe("secret");
    vi.advanceTimersByTime(900);
    expect(get("host", 22, "user", 1_000)).toBe("secret");
    vi.advanceTimersByTime(1_100);
    expect(get("host", 22, "user", 1_000)).toBeNull();
  });

  it("clears all cached credentials", () => {
    set("host-a", 22, "user-a", "secret-a", 60_000);
    set("host-b", 22, "user-b", "secret-b", 60_000);
    clearAll();
    expect(get("host-a", 22, "user-a", 60_000)).toBeNull();
    expect(get("host-b", 22, "user-b", 60_000)).toBeNull();
  });
});
