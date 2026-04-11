import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./index";

type PragmaRow = Record<string, unknown>;

describe("openDatabase pragmas", () => {
  it("enables WAL journal mode on file-backed DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "hypershell-test-"));
    const dbPath = join(dir, "test.db");
    try {
      const db = openDatabase(dbPath);
      const [{ journal_mode }] = db.pragma("journal_mode") as PragmaRow[];
      expect(journal_mode).toBe("wal");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sets synchronous to NORMAL", () => {
    const db = openDatabase(":memory:");
    const [{ synchronous }] = db.pragma("synchronous") as PragmaRow[];
    // NORMAL = 1
    expect(synchronous).toBe(1);
    db.close();
  });

  it("sets busy_timeout to 5000", () => {
    const db = openDatabase(":memory:");
    const [{ timeout }] = db.pragma("busy_timeout") as PragmaRow[];
    expect(timeout).toBe(5000);
    db.close();
  });

  it("sets cache_size to -8000 (8MB)", () => {
    const db = openDatabase(":memory:");
    const [{ cache_size }] = db.pragma("cache_size") as PragmaRow[];
    expect(cache_size).toBe(-8000);
    db.close();
  });

  it("sets temp_store to MEMORY", () => {
    const db = openDatabase(":memory:");
    const [{ temp_store }] = db.pragma("temp_store") as PragmaRow[];
    // MEMORY = 2
    expect(temp_store).toBe(2);
    db.close();
  });

  it("enables foreign keys", () => {
    const db = openDatabase(":memory:");
    const [{ foreign_keys }] = db.pragma("foreign_keys") as PragmaRow[];
    expect(foreign_keys).toBe(1);
    db.close();
  });
});
