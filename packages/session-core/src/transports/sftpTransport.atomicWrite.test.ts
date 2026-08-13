import { describe, expect, it } from "vitest";

import { createSftpTransport, renameWithOverwrite, type SftpConnectionOptions } from "./sftpTransport";

type Cb = (err?: Error | null) => void;
type StatCb = (err: Error | undefined, stats: unknown) => void;
type PathCb = (err: Error | undefined, path: string) => void;

describe("renameWithOverwrite", () => {
  it("prefers the OpenSSH posix-rename extension", async () => {
    const calls: string[] = [];
    const session = {
      ext_openssh_rename: (_f: string, _t: string, cb: Cb) => { calls.push("posix"); cb(null); },
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["posix"]);
  });

  it("falls back to plain rename when the extension is absent", async () => {
    const calls: string[] = [];
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["rename"]);
  });

  it("unlinks then renames when the server refuses to clobber", async () => {
    const calls: string[] = [];
    let renameAttempts = 0;
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => {
        renameAttempts += 1;
        calls.push("rename");
        cb(renameAttempts === 1 ? new Error("Failure") : null);
      },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["rename", "unlink", "rename"]);
  });

  it("falls back to plain rename when the extension itself errors", async () => {
    const calls: string[] = [];
    const session = {
      ext_openssh_rename: (_f: string, _t: string, cb: Cb) => {
        calls.push("posix");
        cb(new Error("unsupported"));
      },
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["posix", "rename"]);
  });

  it("propagates a failure when every strategy fails", async () => {
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => cb(new Error("denied")),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    await expect(renameWithOverwrite(session as never, "/a.tmp", "/a")).rejects.toThrow("denied");
  });

  it("falls through to rename when the extension throws synchronously", async () => {
    // A real SFTPWrapper's ext_openssh_rename always exists on the prototype
    // and throws synchronously (not via the callback) when the server hasn't
    // advertised the posix-rename extension — this must not escape uncaught.
    const calls: string[] = [];
    const session = {
      ext_openssh_rename: (_f: string, _t: string, _cb: Cb) => {
        calls.push("posix");
        throw new Error("Server does not support this extended request");
      },
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["posix", "rename"]);
  });

  it("propagates the rename error, not the unlink error, when the destination unlink also fails", async () => {
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => cb(new Error("rename denied")),
      unlink: (_p: string, cb: Cb) => cb(new Error("unlink denied")),
    };

    await expect(renameWithOverwrite(session as never, "/a.tmp", "/a")).rejects.toThrow("rename denied");
  });

  it("tags the error when the destination was removed but the replacement rename then failed", async () => {
    // At this point the temp file (`from`) is the only surviving copy of the
    // data — callers must detect this and not delete it.
    let renameAttempts = 0;
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => {
        renameAttempts += 1;
        cb(renameAttempts === 1 ? new Error("Failure") : new Error("disk full"));
      },
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    await expect(renameWithOverwrite(session as never, "/a.tmp", "/a")).rejects.toMatchObject({
      message: "disk full",
      destinationRemoved: true,
    });
  });
});

describe("writeFile", () => {
  const validOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass",
  };

  /** A minimal fake write stream: records nothing itself, just replays the outcome once `.end()` is called. */
  function createFakeWriteStream(outcome: "success" | "error", error?: Error) {
    const listeners: Partial<Record<"error" | "close", (err?: Error) => void>> = {};
    return {
      on(event: "error" | "close", cb: (err?: Error) => void) {
        listeners[event] = cb;
        return this;
      },
      end(_data: Buffer) {
        if (outcome === "error") {
          listeners.error?.(error ?? new Error("write failed"));
        } else {
          listeners.close?.();
        }
      },
    };
  }

  /** Wires a fake SFTP session through the same pool path exercised by sftpTransport.test.ts. */
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

  const lstatMissing = (_p: string, cb: StatCb) => cb(new Error("no such file"), undefined);
  const statMissing = (_p: string, cb: StatCb) => cb(new Error("no such file"), undefined);

  it("resolves a symlink target and writes/renames through the resolved path (FIX 2)", async () => {
    const writeStreamPaths: string[] = [];
    const renameCalls: Array<{ from: string; to: string }> = [];
    const session = {
      lstat: (_p: string, cb: StatCb) => cb(undefined, { isSymbolicLink: () => true }),
      realpath: (_p: string, cb: PathCb) => cb(undefined, "/real/target.txt"),
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return createFakeWriteStream("success");
      },
      rename: (from: string, to: string, cb: Cb) => {
        renameCalls.push({ from, to });
        cb(null);
      },
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.writeFile("/link/bashrc", Buffer.from("data"));

    expect(writeStreamPaths).toHaveLength(1);
    expect(writeStreamPaths[0]).toMatch(/^\/real\/\.target\.txt\.hypershell-[0-9a-f]{12}\.tmp$/);
    expect(renameCalls).toEqual([{ from: writeStreamPaths[0], to: "/real/target.txt" }]);
  });

  it("throws an actionable error naming the parent directory when the temp file can't be created (FIX 3)", async () => {
    const permissionError = Object.assign(new Error("Permission denied"), { code: 3 });
    const session = {
      lstat: lstatMissing,
      stat: statMissing,
      createWriteStream: (_path: string) => createFakeWriteStream("error", permissionError),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);

    await expect(transport.writeFile("/etc/hosts", Buffer.from("data"))).rejects.toMatchObject({
      message: expect.stringContaining('no write permission on "/etc"'),
      cause: permissionError,
    });
  });

  it("keeps the temp path unrooted when the target has no directory prefix (FIX 6)", async () => {
    const writeStreamPaths: string[] = [];
    const session = {
      lstat: lstatMissing,
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return createFakeWriteStream("success");
      },
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.writeFile("file.txt", Buffer.from("data"));

    expect(writeStreamPaths).toHaveLength(1);
    expect(writeStreamPaths[0]).toMatch(/^\.file\.txt\.hypershell-[0-9a-f]{12}\.tmp$/);
  });

  it("truncates a long base name so the temp filename stays within 255 bytes (FIX 7)", async () => {
    const writeStreamPaths: string[] = [];
    const longName = `${"a".repeat(300)}.txt`;
    const session = {
      lstat: lstatMissing,
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return createFakeWriteStream("success");
      },
      rename: (_f: string, _t: string, cb: Cb) => cb(null),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);
    await transport.writeFile(`/dir/${longName}`, Buffer.from("data"));

    const tempName = writeStreamPaths[0].split("/").pop()!;
    expect(Buffer.byteLength(tempName)).toBeLessThanOrEqual(255);
  });

  it("unlinks the temp file when the write stream fails after opening (FIX A)", async () => {
    const unlinkCalls: string[] = [];
    const writeError = new Error("quota exceeded");
    const session = {
      lstat: lstatMissing,
      stat: statMissing,
      createWriteStream: (_path: string) => createFakeWriteStream("error", writeError),
      unlink: (path: string, cb: Cb) => {
        unlinkCalls.push(path);
        cb(null);
      },
    };

    const transport = await connectWithSession(session);

    await expect(transport.writeFile("/dir/file.txt", Buffer.from("data"))).rejects.toThrow("quota exceeded");
    expect(unlinkCalls).toHaveLength(1);
    expect(unlinkCalls[0]).toMatch(/^\/dir\/\.file\.txt\.hypershell-[0-9a-f]{12}\.tmp$/);
  });

  it("writes at the requested path for a new file when lstat and stat both fail", async () => {
    const writeStreamPaths: string[] = [];
    const renameCalls: Array<{ from: string; to: string }> = [];
    const session = {
      lstat: lstatMissing,
      stat: statMissing,
      createWriteStream: (path: string) => {
        writeStreamPaths.push(path);
        return createFakeWriteStream("success");
      },
      rename: (from: string, to: string, cb: Cb) => {
        renameCalls.push({ from, to });
        cb(null);
      },
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    const transport = await connectWithSession(session);

    await expect(transport.writeFile("/dir/new.txt", Buffer.from("data"))).resolves.toBeUndefined();
    expect(renameCalls).toEqual([{ from: writeStreamPaths[0], to: "/dir/new.txt" }]);
  });
});
