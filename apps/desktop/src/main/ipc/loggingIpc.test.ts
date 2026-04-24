import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionLogger } from "./loggingIpc";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

describe("SessionLogger", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "hypershell-log-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes data events to file", async () => {
    const logFile = path.join(tempDir, "session.log");
    const logger = createSessionLogger();
    logger.start("sess-1", logFile);
    logger.onSessionData("sess-1", "hello world\n");
    logger.onSessionData("sess-1", "second line\n");
    logger.stop("sess-1");
    await new Promise((r) => setTimeout(r, 50));
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("hello world");
    expect(content).toContain("second line");
  });

  it("strips ANSI escape sequences", async () => {
    const logFile = path.join(tempDir, "ansi.log");
    const logger = createSessionLogger();
    logger.start("sess-1", logFile);
    logger.onSessionData("sess-1", "\x1b[32mgreen\x1b[0m normal");
    logger.stop("sess-1");
    await new Promise((r) => setTimeout(r, 50));
    const content = readFileSync(logFile, "utf-8");
    expect(content).toBe("green normal");
    expect(content).not.toContain("\x1b");
  });

  it("reports logging state", async () => {
    const logFile = path.join(tempDir, "state.log");
    const logger = createSessionLogger();
    expect(logger.getState("sess-1")).toEqual({ active: false, filePath: null, bytesWritten: 0 });
    logger.start("sess-1", logFile);
    expect(logger.getState("sess-1").active).toBe(true);
    expect(logger.getState("sess-1").filePath).toBe(logFile);
    logger.stop("sess-1");
    expect(logger.getState("sess-1").active).toBe(false);
    // Wait for the stream to fully close before afterEach cleans up the temp dir
    await new Promise((r) => setTimeout(r, 50));
  });

  it("ignores data for non-logged sessions", () => {
    const logger = createSessionLogger();
    logger.onSessionData("no-session", "data");
  });

  it("rejects sibling-prefix paths outside allowed roots", () => {
    const logger = createSessionLogger();
    const home = path.resolve(homedir());
    const outside = path.join(path.dirname(home), `${path.basename(home)}-evil`, "session.log");
    expect(() => logger.start("sess-1", outside)).toThrow(
      "Log path must be within the user home or temp directory"
    );
  });
});
