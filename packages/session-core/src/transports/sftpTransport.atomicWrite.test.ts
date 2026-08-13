import { describe, expect, it } from "vitest";

import { renameWithOverwrite } from "./sftpTransport";

type Cb = (err?: Error | null) => void;

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
