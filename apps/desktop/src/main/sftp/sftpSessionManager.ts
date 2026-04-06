import { createSftpTransport, type SftpConnectionOptions, type SftpTransportHandle } from "@sshterm/session-core";
import type { SessionTransportEvent } from "@sshterm/session-core";
import { randomUUID } from "node:crypto";

export interface SftpSession {
  sftpSessionId: string;
  hostId: string;
  transport: SftpTransportHandle;
}

export type SftpSessionEvent = { sftpSessionId: string } & SessionTransportEvent;

export interface SftpSessionManager {
  connect(hostId: string, options: SftpConnectionOptions): Promise<string>;
  disconnect(sftpSessionId: string): void;
  getSession(sftpSessionId: string): SftpSession | undefined;
  getTransport(sftpSessionId: string): SftpTransportHandle;
  onEvent(listener: (event: SftpSessionEvent) => void): () => void;
  disconnectAll(): void;
}

export function createSftpSessionManager(): SftpSessionManager {
  const sessions = new Map<string, SftpSession>();
  const listeners = new Set<(event: SftpSessionEvent) => void>();

  function emit(sftpSessionId: string, event: SessionTransportEvent): void {
    const payload: SftpSessionEvent = { sftpSessionId, ...event };
    for (const listener of listeners) {
      listener(payload);
    }
  }

  async function connect(hostId: string, options: SftpConnectionOptions): Promise<string> {
    const sftpSessionId = `sftp-${randomUUID().replace(/-/g, "")}`;
    const transport = createSftpTransport(sftpSessionId, options);

    transport.onEvent((event) => {
      emit(sftpSessionId, event);
    });

    await transport.connect();
    sessions.set(sftpSessionId, { sftpSessionId, hostId, transport });
    return sftpSessionId;
  }

  function disconnect(sftpSessionId: string): void {
    const session = sessions.get(sftpSessionId);
    if (!session) {
      return;
    }

    session.transport.disconnect();
    sessions.delete(sftpSessionId);
  }

  function getSession(sftpSessionId: string): SftpSession | undefined {
    return sessions.get(sftpSessionId);
  }

  function getTransport(sftpSessionId: string): SftpTransportHandle {
    const session = sessions.get(sftpSessionId);
    if (!session) {
      throw new Error(`SFTP session ${sftpSessionId} not found`);
    }

    return session.transport;
  }

  function onEvent(listener: (event: SftpSessionEvent) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function disconnectAll(): void {
    for (const session of sessions.values()) {
      session.transport.disconnect();
    }

    sessions.clear();
  }

  return {
    connect,
    disconnect,
    getSession,
    getTransport,
    onEvent,
    disconnectAll
  };
}
