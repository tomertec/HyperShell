import {
  closeSessionRequestSchema,
  ipcChannels,
  openSessionRequestSchema,
  resizeSessionRequestSchema,
  setSignalsRequestSchema,
  writeSessionRequestSchema
} from "@sshterm/shared";
import type {
  CloseSessionRequest,
  OpenSessionRequest,
  OpenSessionResponse,
  ResizeSessionRequest,
  WriteSessionRequest
} from "@sshterm/shared";
import { createSessionManager } from "@sshterm/session-core";
import { registerHostIpc, getOrCreateHostsRepo } from "./hostsIpc";
import { registerSettingsIpc } from "./settingsIpc";
import { registerSshConfigIpc } from "./sshConfigIpc";
import { registerPortForwardIpc } from "./portForwardIpc";
import { registerGroupsIpc } from "./groupsIpc";
import { registerSerialProfilesIpc } from "./serialProfilesIpc";
import { createGroupsRepository, createSerialProfilesRepository } from "@sshterm/db";
import type { SerialProfileRecord } from "@sshterm/db";
import type {
  SessionManager,
  SessionTransportEvent,
  TransportHandle,
  SerialConnectionOptions
} from "@sshterm/session-core";
import type { IpcMain, IpcMainInvokeEvent } from "electron";

const registeredChannels = [
  ipcChannels.session.open,
  ipcChannels.session.resize,
  ipcChannels.session.write,
  ipcChannels.session.close,
  ipcChannels.hosts.list,
  ipcChannels.hosts.upsert,
  ipcChannels.hosts.remove,
  ipcChannels.hosts.importSshConfig,
  ipcChannels.settings.get,
  ipcChannels.settings.update,
  ipcChannels.portForward.start,
  ipcChannels.portForward.stop,
  ipcChannels.portForward.list,
  ipcChannels.groups.list,
  ipcChannels.groups.upsert,
  ipcChannels.groups.remove,
  ipcChannels.serialProfiles.list,
  ipcChannels.serialProfiles.upsert,
  ipcChannels.serialProfiles.remove,
  ipcChannels.serialProfiles.listPorts,
  ipcChannels.session.setSignals
] as const;

const sessionManager = createSessionManager();

const groupsRepo = createGroupsRepository();
const serialProfilesRepo = createSerialProfilesRepository();

let cleanupRegisteredIpc: (() => void) | null = null;

export interface RegisterIpcOptions {
  emitSessionEvent?: (event: unknown) => void;
  sessionManager?: SessionManager;
  resolveHostProfile?: (profileId: string) => Promise<{ hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string; keepAliveSeconds?: number } | null>;
  resolveSerialProfile?: (profileId: string) => SerialProfileRecord | undefined;
}

export type IpcMainLike = Pick<IpcMain, "handle"> &
  Partial<Pick<IpcMain, "removeHandler">>;

async function openSessionHandler(
  _event: IpcMainInvokeEvent,
  request: OpenSessionRequest,
  manager: SessionManager = sessionManager,
  resolveHostProfile?: RegisterIpcOptions["resolveHostProfile"],
  resolveSerialProfile?: RegisterIpcOptions["resolveSerialProfile"]
): Promise<OpenSessionResponse> {
  const parsed = openSessionRequestSchema.parse(request);

  let sshOptions: { hostname: string; username?: string; port?: number; identityFile?: string; proxyJump?: string; keepAliveSeconds?: number } | undefined;

  if (parsed.transport === "ssh" && resolveHostProfile) {
    const profile = await resolveHostProfile(parsed.profileId);
    if (profile) {
      sshOptions = profile;
    }
  }

  let serialOptions: SerialConnectionOptions | undefined;

  if (parsed.transport === "serial") {
    const profile = resolveSerialProfile?.(parsed.profileId);
    if (profile) {
      serialOptions = {
        path: profile.path,
        baudRate: profile.baudRate,
        dataBits: profile.dataBits as 5 | 6 | 7 | 8,
        stopBits: profile.stopBits as 1 | 2,
        parity: profile.parity as "none" | "even" | "odd" | "mark" | "space",
        flowControl: profile.flowControl as "none" | "hardware" | "software",
        localEcho: profile.localEcho,
        dtr: profile.dtr,
        rts: profile.rts
      };
    }
  }

  return manager.open({
    ...parsed,
    sshOptions: sshOptions ?? { hostname: parsed.profileId },
    serialOptions
  });
}

async function resizeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: ResizeSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = resizeSessionRequestSchema.parse(_request);
  manager.resize(parsed.sessionId, parsed.cols, parsed.rows);
}

async function writeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: WriteSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = writeSessionRequestSchema.parse(_request);
  manager.write(parsed.sessionId, parsed.data);
}

async function closeSessionHandler(
  _event: IpcMainInvokeEvent,
  _request: CloseSessionRequest,
  manager: SessionManager = sessionManager
): Promise<void> {
  const parsed = closeSessionRequestSchema.parse(_request);
  manager.close(parsed.sessionId);
}

export function getRegisteredChannels(): readonly string[] {
  return registeredChannels;
}

export function registerIpc(
  ipcMain: IpcMainLike,
  options: RegisterIpcOptions = {}
): () => void {
  cleanupRegisteredIpc?.();

  const manager = options.sessionManager ?? sessionManager;
  const unsubscribeSessionEvents = manager.onEvent((event) => {
    options.emitSessionEvent?.(event);
  });

  for (const channel of registeredChannels) {
    ipcMain.removeHandler?.(channel);
  }

  ipcMain.handle(ipcChannels.session.open, (event, request) =>
    openSessionHandler(event, request, manager, options.resolveHostProfile, (id) => serialProfilesRepo.get(id))
  );
  ipcMain.handle(ipcChannels.session.resize, (event, request) =>
    resizeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.write, (event, request) =>
    writeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.close, (event, request) =>
    closeSessionHandler(event, request, manager)
  );
  ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
    const parsed = setSignalsRequestSchema.parse(request);
    manager.setSignals(parsed.sessionId, parsed.signals);
  });

  registerHostIpc(ipcMain);
  registerSshConfigIpc(ipcMain, () => getOrCreateHostsRepo());
  registerSettingsIpc(ipcMain, () => null);
  registerPortForwardIpc(ipcMain);
  registerGroupsIpc(ipcMain, () => groupsRepo);
  registerSerialProfilesIpc(ipcMain, () => serialProfilesRepo);

  const cleanup = () => {
    unsubscribeSessionEvents();
    for (const channel of registeredChannels) {
      ipcMain.removeHandler?.(channel);
    }

    if (cleanupRegisteredIpc === cleanup) {
      cleanupRegisteredIpc = null;
    }
  };

  cleanupRegisteredIpc = cleanup;
  return cleanup;
}

function createInertTransport(sessionId: string): TransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();

  return {
    write() {},
    resize() {},
    close() {
      for (const listener of listeners) {
        listener({
          type: "exit",
          sessionId,
          exitCode: null
        });
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export async function openSessionForTest(
  request: OpenSessionRequest
): Promise<OpenSessionResponse> {
  const testSessionManager = createSessionManager({
    createTransport(input) {
      return createInertTransport(input.sessionId);
    }
  });

  return openSessionHandler({} as IpcMainInvokeEvent, request, testSessionManager);
}
