import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SqliteDatabase } from "./index";
import { openDatabase, withOpenDatabase } from "./index";

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

describe("withOpenDatabase", () => {
  it("returns what the factory built and leaves the handle usable", () => {
    const db = withOpenDatabase(":memory:", (handle) => handle);
    expect(() => db.prepare("SELECT 1").get()).not.toThrow();
    db.close();
  });

  it("closes the handle when the repository factory throws", () => {
    let captured: SqliteDatabase | undefined;

    expect(() =>
      withOpenDatabase(":memory:", (handle) => {
        captured = handle;
        throw new Error("repository construction failed");
      })
    ).toThrow(/repository construction failed/);

    // Without the close() the caller falls back to an in-memory repository
    // while this handle stays open for the life of the process.
    expect(() => captured?.prepare("SELECT 1")).toThrow(/not open/i);
  });
});

describe("openDatabase migrations", () => {
  it("applies migration 017 so hosts carries shell_integration", () => {
    const db = openDatabase(":memory:");
    const columns = (db.pragma("table_info(hosts)") as PragmaRow[]).map((c) => c.name);
    expect(columns).toContain("shell_integration");
    db.close();
  });
});

describe("migration files", () => {
  it("reads every migration file in migrations/ (none are decorative)", () => {
    const srcDir = fileURLToPath(new URL(".", import.meta.url));
    const indexSource = readFileSync(join(srcDir, "index.ts"), "utf8");
    const migrationFiles = readdirSync(join(srcDir, "migrations")).filter((f) =>
      f.endsWith(".sql")
    );
    expect(migrationFiles.length).toBeGreaterThanOrEqual(18);
    for (const file of migrationFiles) {
      expect(
        indexSource,
        `${file} is never read by openDatabase — editing it does nothing`
      ).toContain(file);
    }
  });

  it("applies the file-driven migrations to a fresh database", () => {
    const db = openDatabase(":memory:");
    const hostCols = (db.pragma("table_info(hosts)") as PragmaRow[]).map((c) => c.name);
    expect(hostCols).toEqual(
      expect.arrayContaining(["is_favorite", "sort_order", "color", "tmux_detect"])
    );
    const groupCols = (db.pragma("table_info(host_groups)") as PragmaRow[]).map((c) => c.name);
    expect(groupCols).toContain("sort_order");
    const tagCols = (db.pragma("table_info(tags)") as PragmaRow[]).map((c) => c.name);
    expect(tagCols).toContain("color");
    db.close();
  });

  it("reopens an already-migrated database without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "hypershell-remigrate-"));
    const dbPath = join(dir, "test.db");
    try {
      openDatabase(dbPath).close();
      expect(() => openDatabase(dbPath).close()).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
