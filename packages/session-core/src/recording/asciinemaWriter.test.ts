import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { AsciinemaWriter } from "./asciinemaWriter";

describe("AsciinemaWriter", () => {
  it("writes a valid header and output frames", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sshterm-cast-writer-"));
    const filePath = path.join(dir, "session.cast");

    try {
      const writer = new AsciinemaWriter({
        filePath,
        width: 120,
        height: 40,
        title: "My Session",
        startedAtMs: Date.parse("2026-04-08T10:00:00.000Z"),
      });

      writer.appendOutput("hello ", Date.parse("2026-04-08T10:00:00.500Z"));
      writer.appendOutput("world\\r\\n", Date.parse("2026-04-08T10:00:01.000Z"));
      const finalized = await writer.finalize(Date.parse("2026-04-08T10:00:02.250Z"));

      expect(finalized.durationMs).toBe(2250);
      expect(finalized.eventCount).toBe(2);
      expect(finalized.fileSizeBytes).toBeGreaterThan(0);

      const lines = readFileSync(filePath, "utf-8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));

      expect(lines[0]).toMatchObject({
        version: 2,
        width: 120,
        height: 40,
        timestamp: Math.floor(Date.parse("2026-04-08T10:00:00.000Z") / 1000),
        title: "My Session",
      });
      expect(lines[1]).toEqual([0.5, "o", "hello "]);
      expect(lines[2]).toEqual([1, "o", "world\\r\\n"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores empty writes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sshterm-cast-writer-"));
    const filePath = path.join(dir, "session.cast");

    try {
      const writer = new AsciinemaWriter({ filePath, width: 80, height: 24, startedAtMs: 1_000 });
      writer.appendOutput("", 1_200);
      const finalized = await writer.finalize(1_500);
      expect(finalized.eventCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
