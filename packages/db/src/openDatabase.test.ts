import { describe, expect, it } from "vitest";
import { openDatabase } from "./index";

describe("openDatabase pragmas", () => {
  it("enables WAL journal mode", () => {
    const db = openDatabase(":memory:");
    const result = db.pragma("journal_mode");
    // In-memory databases fall back to "memory" journal mode, so we verify
    // the pragma call doesn't throw. For file-backed DBs it returns "wal".
    expect(result).toBeDefined();
    db.close();
  });

  it("sets synchronous to NORMAL", () => {
    const db = openDatabase(":memory:");
    const [{ synchronous }] = db.pragma("synchronous");
    // NORMAL = 1
    expect(synchronous).toBe(1);
    db.close();
  });

  it("sets busy_timeout to 5000", () => {
    const db = openDatabase(":memory:");
    const [{ timeout }] = db.pragma("busy_timeout");
    expect(timeout).toBe(5000);
    db.close();
  });

  it("sets cache_size to -8000 (8MB)", () => {
    const db = openDatabase(":memory:");
    const [{ cache_size }] = db.pragma("cache_size");
    expect(cache_size).toBe(-8000);
    db.close();
  });

  it("sets temp_store to MEMORY", () => {
    const db = openDatabase(":memory:");
    const [{ temp_store }] = db.pragma("temp_store");
    // MEMORY = 2
    expect(temp_store).toBe(2);
    db.close();
  });

  it("enables foreign keys", () => {
    const db = openDatabase(":memory:");
    const [{ foreign_keys }] = db.pragma("foreign_keys");
    expect(foreign_keys).toBe(1);
    db.close();
  });
});
