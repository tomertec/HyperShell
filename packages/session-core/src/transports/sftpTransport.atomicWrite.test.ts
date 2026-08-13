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
});
