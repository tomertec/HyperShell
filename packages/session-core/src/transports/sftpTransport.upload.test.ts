import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";

import { createSftpTransport, type SftpConnectionOptions } from "./sftpTransport";

type Cb = (err?: Error | null) => void;
type StatCb = (err: Error | undefined, stats: unknown) => void;

const validOptions: SftpConnectionOptions = {
  hostname: "example.com",
  port: 22,
  username: "testuser",
  authMethod: "password",
  password: "testpass",
};

/** Wires a fake SFTP session through the pool path, same as the atomicWrite tests. */
async function connectWithSession(session: Record<string, unknown>) {
  const fakeClient = {
    sftp(callback: (error: Error | undefined, sftpSession?: unknown) => void) {
      callback(undefined, session);
    },
  };
  const pool = {
    acquire: () => Promise.resolve({ connectionId: "conn-1", consumerId: "consumer-1", client: fakeClient }),
    release: () => {},
    destroy() {},
    destroyAll() {},
    getStats() {
      return [];
    },
  };

  const transport = createSftpTransport("test-session", validOptions, { pool: pool as never });
  await transport.connect();
  return transport;
}

const statMissing = (_p: string, cb: StatCb) => cb(new Error("no such file"), undefined);

/** A real Writable that collects chunks, so `pipe()` from a real fs read stream works. */
function collectingWriteStream(chunks: Buffer[]): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
}

const localDir = mkdtempSync(join(tmpdir(), "hypershell-upload-test-"));
afterAll(() => rmSync(localDir, { recursive: true, force: true }));

function localFile(name: string, content: string): string {
  const filePath = join(localDir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe("upload", () => {
  it("streams through a random-suffix sibling temp file and renames it into place", async () => {
    const writeStreamPaths: string[] = [];
    const chunks: Buffer[] = [];
    const renameCalls: Array<{ from: string; to: string }> = [];
    const session = {
      lstat: statMissing,
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return collectingWriteStream(chunks);
      },
      rename: (from: string, to: string, cb: Cb) => {
        renameCalls.push({ from, to });
        cb(null);
      },
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.upload(localFile("plain.txt", "hello world"), "/dir/plain.txt");

    expect(writeStreamPaths).toHaveLength(1);
    expect(writeStreamPaths[0]).toMatch(/^\/dir\/\.plain\.txt\.hypershell-[0-9a-f]{12}\.tmp$/);
    expect(Buffer.concat(chunks).toString()).toBe("hello world");
    expect(renameCalls).toEqual([{ from: writeStreamPaths[0], to: "/dir/plain.txt" }]);
  });

  it("uses a deterministic temp name when the caller opts into resume", async () => {
    const writeStreamPaths: string[] = [];
    const session = {
      lstat: statMissing,
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return collectingWriteStream([]);
      },
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.upload(localFile("det.txt", "data"), "/dir/det.txt", { resumeOffset: 0 });

    expect(writeStreamPaths).toEqual(["/dir/.det.txt.hypershell-upload.tmp"]);
  });

  it("continues an interrupted upload when the partial temp file matches resumeOffset", async () => {
    const openCalls: Array<{ path: string; options?: { start?: number; flags?: string } }> = [];
    const chunks: Buffer[] = [];
    const progress: number[] = [];
    const session = {
      lstat: statMissing,
      stat: (path: string, cb: StatCb) =>
        path.endsWith(".hypershell-upload.tmp")
          ? cb(undefined, { size: 4, mode: 0o100644, mtime: 0 })
          : cb(new Error("no such file"), undefined),
      createWriteStream: (path: string, options?: { start?: number; flags?: string }) => {
        openCalls.push({ path, options });
        return collectingWriteStream(chunks);
      },
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.upload(localFile("resume.txt", "0123456789"), "/dir/resume.txt", {
      resumeOffset: 4,
      onProgress: (bytes) => progress.push(bytes),
    });

    expect(openCalls).toEqual([
      { path: "/dir/.resume.txt.hypershell-upload.tmp", options: { start: 4, flags: "r+" } },
    ]);
    expect(Buffer.concat(chunks).toString()).toBe("456789");
    // Progress is cumulative — it includes the bytes the previous attempt wrote.
    expect(progress.at(-1)).toBe(10);
  });

  it("starts over from zero when the partial temp file does not match resumeOffset", async () => {
    const openCalls: Array<{ path: string; options?: unknown }> = [];
    const chunks: Buffer[] = [];
    const session = {
      lstat: statMissing,
      stat: (path: string, cb: StatCb) =>
        path.endsWith(".hypershell-upload.tmp")
          ? cb(undefined, { size: 7, mode: 0o100644, mtime: 0 })
          : cb(new Error("no such file"), undefined),
      createWriteStream: (path: string, options?: unknown) => {
        openCalls.push({ path, options });
        return collectingWriteStream(chunks);
      },
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.upload(localFile("stale.txt", "0123456789"), "/dir/stale.txt", { resumeOffset: 4 });

    expect(openCalls).toHaveLength(1);
    expect(openCalls[0].options).toBeUndefined();
    expect(Buffer.concat(chunks).toString()).toBe("0123456789");
  });

  it("carries the original file's mode onto the temp file before the rename", async () => {
    const chmodCalls: Array<{ path: string; mode: number }> = [];
    const session = {
      lstat: statMissing,
      stat: (path: string, cb: StatCb) =>
        path === "/dir/mode.txt"
          ? cb(undefined, { size: 3, mode: 0o100600, mtime: 0 })
          : cb(new Error("no such file"), undefined),
      chmod: (path: string, mode: number, cb: Cb) => {
        chmodCalls.push({ path, mode });
        cb(null);
      },
      createWriteStream: () => collectingWriteStream([]),
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.upload(localFile("mode.txt", "abc"), "/dir/mode.txt");

    expect(chmodCalls).toHaveLength(1);
    expect(chmodCalls[0].mode).toBe(0o600);
    expect(chmodCalls[0].path).toMatch(/\.hypershell-[0-9a-f]{12}\.tmp$/);
  });

  it("removes the temp file when a non-resumable upload fails mid-stream", async () => {
    const unlinkCalls: string[] = [];
    const session = {
      lstat: statMissing,
      stat: statMissing,
      createWriteStream: () =>
        new Writable({
          write(_chunk, _encoding, callback) {
            callback(new Error("quota exceeded"));
          },
        }),
      unlink: (path: string, cb: Cb) => {
        unlinkCalls.push(path);
        cb(null);
      },
    };

    const transport = await connectWithSession(session);

    await expect(
      transport.upload(localFile("fail.txt", "data"), "/dir/fail.txt")
    ).rejects.toThrow("quota exceeded");
    expect(unlinkCalls).toHaveLength(1);
    expect(unlinkCalls[0]).toMatch(/^\/dir\/\.fail\.txt\.hypershell-[0-9a-f]{12}\.tmp$/);
  });

  it("keeps the partial temp file when a resumable upload fails mid-stream", async () => {
    const unlinkCalls: string[] = [];
    const session = {
      lstat: statMissing,
      stat: statMissing,
      createWriteStream: () =>
        new Writable({
          write(_chunk, _encoding, callback) {
            callback(new Error("connection reset"));
          },
        }),
      unlink: (path: string, cb: Cb) => {
        unlinkCalls.push(path);
        cb(null);
      },
    };

    const transport = await connectWithSession(session);

    await expect(
      transport.upload(localFile("keep.txt", "data"), "/dir/keep.txt", { resumeOffset: 0 })
    ).rejects.toThrow("connection reset");
    expect(unlinkCalls).toHaveLength(0);
  });

  it("rejects on abort and keeps a resumable partial for the next attempt", async () => {
    const unlinkCalls: string[] = [];
    const abortController = new AbortController();
    const session = {
      lstat: statMissing,
      stat: statMissing,
      createWriteStream: () =>
        new Writable({
          write(_chunk, _encoding, _callback) {
            // Never complete the write — abort lands mid-flight.
            abortController.abort();
          },
        }),
      unlink: (path: string, cb: Cb) => {
        unlinkCalls.push(path);
        cb(null);
      },
    };

    const transport = await connectWithSession(session);

    await expect(
      transport.upload(localFile("abort.txt", "data"), "/dir/abort.txt", {
        resumeOffset: 0,
        signal: abortController.signal,
      })
    ).rejects.toThrow("Upload aborted");
    expect(unlinkCalls).toHaveLength(0);
  });
});
