import {
  ipcChannels,
  startPortForwardRequestSchema,
  stopPortForwardRequestSchema,
  type StartPortForwardRequest,
  type StopPortForwardRequest
} from "@sshterm/shared";
import { createPortForward, type PortForwardHandle } from "@sshterm/session-core";
import type { IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import type { IpcMainLike } from "./registerIpc";

const activeForwards = new Map<string, PortForwardHandle>();

export function registerPortForwardIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.portForward.start, (_event: IpcMainInvokeEvent, request: StartPortForwardRequest) => {
    const parsed = startPortForwardRequestSchema.parse(request);
    const id = randomUUID();

    const nodePty = require("node-pty") as { spawn: Function };

    const handle = createPortForward(
      {
        hostname: parsed.hostname,
        username: parsed.username,
        port: parsed.port,
        forward: {
          protocol: parsed.protocol,
          localAddress: parsed.localAddress,
          localPort: parsed.localPort,
          remoteHost: parsed.remoteHost,
          remotePort: parsed.remotePort
        }
      },
      nodePty.spawn
    );

    handle.onExit(() => { activeForwards.delete(id); });
    activeForwards.set(id, handle);

    return { id };
  });

  ipcMain.handle(ipcChannels.portForward.stop, (_event: IpcMainInvokeEvent, request: StopPortForwardRequest) => {
    const parsed = stopPortForwardRequestSchema.parse(request);
    const handle = activeForwards.get(parsed.id);
    if (handle) {
      handle.close();
      activeForwards.delete(parsed.id);
    }
  });

  ipcMain.handle(ipcChannels.portForward.list, () => {
    return Array.from(activeForwards.keys()).map((id) => ({ id }));
  });
}
