import { mkdirSync, mkdtempSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ClaudeSessionFile } from "./claudeSessionBinder";
import { scanRecentClaudeSessions, watchClaudeSessions } from "./claudeSessions";

/**
 * Exercises the session-store adapter against a real filesystem: both halves
 * are platform behaviour (a recursive fs.watch, and Windows' backslash in the
 * reported path) that no amount of mocking would prove.
 *
 * `USERPROFILE` is redirected so the user's own conversations are neither read
 * nor written.
 */
const REAL_HOME = process.env.USERPROFILE;
const ID = "5f6a1b2c-3d4e-4f50-8a1b-2c3d4e5f6a7b";
const OTHER_ID = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";

let projectDir = "";

describe("Claude session store", () => {
  beforeAll(() => {
    const home = mkdtempSync(join(tmpdir(), "hypershell-claude-"));
    process.env.USERPROFILE = home;
    projectDir = join(home, ".claude", "projects", "C--fake-repo");
    mkdirSync(projectDir, { recursive: true });
  });

  afterAll(() => {
    process.env.USERPROFILE = REAL_HOME;
  });

  it("reports a conversation as it is written", async () => {
    const seen: ClaudeSessionFile[] = [];
    const stop = watchClaudeSessions((file) => seen.push(file));
    expect(stop).not.toBeNull();

    try {
      writeFileSync(join(projectDir, `${ID}.jsonl`), "{}\n");
      appendFileSync(join(projectDir, `${ID}.jsonl`), "{}\n");
      // Not a conversation file — it must not be reported as one.
      writeFileSync(join(projectDir, "notes.txt"), "hello");

      await vi.waitFor(
        () =>
          expect(
            seen.some(
              (file) => file.claudeSessionId === ID && file.directory === "C--fake-repo"
            )
          ).toBe(true),
        { timeout: 5_000 }
      );

      expect(seen.every((file) => file.claudeSessionId === ID)).toBe(true);
    } finally {
      stop?.();
    }
  });

  it("scans conversations touched since a cutoff", async () => {
    writeFileSync(join(projectDir, `${OTHER_ID}.jsonl`), "{}\n");

    const all = await scanRecentClaudeSessions(0);
    expect(all.map((file) => file.claudeSessionId).sort()).toEqual([OTHER_ID, ID].sort());

    const none = await scanRecentClaudeSessions(Date.now() + 60_000);
    expect(none).toEqual([]);
  });
});
