import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { parseAsciinemaCast, readAsciinemaCast } from "./asciinemaReader";

describe("asciinemaReader", () => {
  it("parses header and frames", () => {
    const parsed = parseAsciinemaCast([
      JSON.stringify({ version: 2, width: 80, height: 24, timestamp: 1_700_000_000 }),
      JSON.stringify([0.5, "o", "hello "]),
      JSON.stringify([1, "o", "world\\r\\n"]),
    ].join("\n"));

    expect(parsed.header.version).toBe(2);
    expect(parsed.frames).toEqual([
      [0.5, "o", "hello "],
      [1, "o", "world\\r\\n"],
    ]);
  });

  it("reads from disk", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hypershell-cast-reader-"));
    const filePath = path.join(dir, "read.cast");

    try {
      writeFileSync(
        filePath,
        [
          JSON.stringify({ version: 2, width: 100, height: 30, timestamp: 1_700_000_100 }),
          JSON.stringify([0, "o", "prompt> "]),
        ].join("\n")
      );

      const parsed = readAsciinemaCast(filePath);
      expect(parsed.header.width).toBe(100);
      expect(parsed.frames[0]).toEqual([0, "o", "prompt> "]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws on invalid header", () => {
    expect(() => parseAsciinemaCast("{}")).toThrow(/Invalid ASCIINEMA header/);
  });
});
