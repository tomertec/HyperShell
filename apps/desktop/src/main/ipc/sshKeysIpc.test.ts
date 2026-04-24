import path from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { ipcChannels } from "@hypershell/shared";
import { registerSshKeysIpc } from "./sshKeysIpc";

type Handler = (event: unknown, request: unknown) => unknown;

function createHandlerMap(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  registerSshKeysIpc({
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler);
    },
  } as never);
  return handlers;
}

describe("registerSshKeysIpc", () => {
  it("rejects key generation names with path separators", async () => {
    const handlers = createHandlerMap();
    const generate = handlers.get(ipcChannels.sshKeys.generate);
    if (!generate) {
      throw new Error("Missing sshKeys.generate handler");
    }

    await expect(
      Promise.resolve(
        generate({}, {
          type: "ed25519",
          name: "..\\evil",
        })
      )
    ).rejects.toThrow("SSH key name cannot include path separators");
  });

  it("rejects remove requests outside ~/.ssh", async () => {
    const handlers = createHandlerMap();
    const remove = handlers.get(ipcChannels.sshKeys.remove);
    if (!remove) {
      throw new Error("Missing sshKeys.remove handler");
    }

    const outsidePath = path.resolve(path.sep, "tmp", "outside-key");
    await expect(
      Promise.resolve(
        remove({}, { path: outsidePath })
      )
    ).rejects.toThrow("SSH key path must be within the ~/.ssh directory");
  });

  it("rejects fingerprint requests outside ~/.ssh", async () => {
    const handlers = createHandlerMap();
    const getFingerprint = handlers.get(ipcChannels.sshKeys.getFingerprint);
    if (!getFingerprint) {
      throw new Error("Missing sshKeys.getFingerprint handler");
    }

    const outsidePath = path.resolve(path.sep, "tmp", "outside-key");
    await expect(
      Promise.resolve(
        getFingerprint({}, { path: outsidePath })
      )
    ).rejects.toThrow("SSH key path must be within the ~/.ssh directory");
  });

  it("rejects PPK conversion requests outside user-safe roots", async () => {
    const handlers = createHandlerMap();
    const convertPpk = handlers.get(ipcChannels.sshKeys.convertPpk);
    if (!convertPpk) {
      throw new Error("Missing sshKeys.convertPpk handler");
    }

    const home = path.resolve(homedir());
    const outsidePath = path.join(path.dirname(home), `${path.basename(home)}-evil`, "outside-key.ppk");
    await expect(
      Promise.resolve(
        convertPpk({}, { ppkPath: outsidePath })
      )
    ).rejects.toThrow("PPK path must be within the user home or temp directory");
  });

  it("rejects PPK conversion requests without a PPK extension", async () => {
    const handlers = createHandlerMap();
    const convertPpk = handlers.get(ipcChannels.sshKeys.convertPpk);
    if (!convertPpk) {
      throw new Error("Missing sshKeys.convertPpk handler");
    }

    const keyPath = path.join(homedir(), "key.txt");
    await expect(
      Promise.resolve(
        convertPpk({}, { ppkPath: keyPath })
      )
    ).rejects.toThrow("PPK conversion requires a .ppk file");
  });
});
