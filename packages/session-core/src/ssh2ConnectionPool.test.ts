import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createSsh2ConnectionPool } from "./ssh2ConnectionPool";
import type { ResolvedAuth, Ssh2PoolTarget } from "./ssh2ConnectionPool";

// Mock ssh2 Client
vi.mock("ssh2", () => {
  const MockClient = vi.fn().mockImplementation(function(this: any) {
    this._listeners = new Map();
    this.connect = vi.fn().mockImplementation(() => {
      // Simulate ready event via microtask so it works with fake timers
      queueMicrotask(() => {
        const readyCbs = this._listeners.get("ready") || [];
        for (const cb of readyCbs) cb();
      });
    });
    this.on = vi.fn().mockImplementation((event: string, cb: Function) => {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(cb);
      return this;
    });
    this.once = vi.fn().mockImplementation((event: string, cb: Function) => {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(cb);
      return this;
    });
    this.removeListener = vi.fn().mockImplementation((event: string, cb: Function) => {
      const cbs = this._listeners.get(event) || [];
      this._listeners.set(event, cbs.filter((c: Function) => c !== cb));
      return this;
    });
    this.end = vi.fn();
    this.removeAllListeners = vi.fn();
  });
  return { Client: MockClient };
});

function makeTarget(overrides: Partial<Ssh2PoolTarget> = {}): Ssh2PoolTarget {
  return {
    hostname: "host.example.com",
    port: 22,
    username: "user",
    auth: { type: "password", password: "pass" },
    ...overrides,
  };
}

describe("ssh2ConnectionPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a new connection on first acquire", async () => {
    const pool = createSsh2ConnectionPool();
    const conn = await pool.acquire(makeTarget());
    expect(conn.connectionId).toBeDefined();
    expect(conn.consumerId).toBeDefined();
    expect(conn.client).toBeDefined();
    pool.destroyAll();
  });

  it("reuses connection for same host:port:user", async () => {
    const pool = createSsh2ConnectionPool();
    const conn1 = await pool.acquire(makeTarget());
    const conn2 = await pool.acquire(makeTarget());
    expect(conn1.connectionId).toBe(conn2.connectionId);
    expect(conn1.consumerId).not.toBe(conn2.consumerId);
    pool.destroyAll();
  });

  it("creates separate connections for different targets", async () => {
    const pool = createSsh2ConnectionPool();
    const conn1 = await pool.acquire(makeTarget({ hostname: "host1.example.com" }));
    const conn2 = await pool.acquire(makeTarget({ hostname: "host2.example.com" }));
    expect(conn1.connectionId).not.toBe(conn2.connectionId);
    pool.destroyAll();
  });

  it("keeps connection alive while consumers remain", async () => {
    const pool = createSsh2ConnectionPool();
    const conn1 = await pool.acquire(makeTarget());
    const conn2 = await pool.acquire(makeTarget());

    pool.release(conn1.connectionId, conn1.consumerId);
    expect(pool.getStats()).toHaveLength(1);
    expect(pool.getStats()[0].consumerCount).toBe(1);
    pool.destroyAll();
  });

  it("closes connection after idle timeout when all consumers release", async () => {
    const pool = createSsh2ConnectionPool();
    const conn = await pool.acquire(makeTarget());

    pool.release(conn.connectionId, conn.consumerId);
    expect(pool.getStats()).toHaveLength(1); // still alive during grace period

    vi.advanceTimersByTime(31000); // past 30s idle timeout
    expect(pool.getStats()).toHaveLength(0); // cleaned up
  });

  it("getStats returns active connection info", async () => {
    const pool = createSsh2ConnectionPool();
    await pool.acquire(makeTarget());

    const stats = pool.getStats();
    expect(stats).toHaveLength(1);
    expect(stats[0].hostname).toBe("host.example.com");
    expect(stats[0].consumerCount).toBe(1);
    pool.destroyAll();
  });

  it("destroyAll closes everything", async () => {
    const pool = createSsh2ConnectionPool();
    await pool.acquire(makeTarget({ hostname: "h1" }));
    await pool.acquire(makeTarget({ hostname: "h2" }));

    pool.destroyAll();
    expect(pool.getStats()).toHaveLength(0);
  });

  it("cancels idle timer when new consumer acquires", async () => {
    const pool = createSsh2ConnectionPool();
    const conn1 = await pool.acquire(makeTarget());
    pool.release(conn1.connectionId, conn1.consumerId);

    // Acquire again before timeout
    const conn2 = await pool.acquire(makeTarget());
    vi.advanceTimersByTime(31000);

    // Connection should still be alive (idle timer was cancelled)
    expect(pool.getStats()).toHaveLength(1);
    pool.destroyAll();
  });
});
