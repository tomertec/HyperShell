import { describe, expect, it } from "vitest";

import type { SessionTransportEvent } from "./transportEvents";
import {
  buildSerialPortOptions,
  createSerialTransport,
  normalizeSerialProfile,
  type SerialPortLike
} from "./serialTransport";

class FakeSerialPort implements SerialPortLike {
  public isOpen = false;
  public writeCalls: string[] = [];
  public openError: Error | null = null;
  public writeError: Error | null = null;
  public closeError: Error | null = null;

  private listeners: {
    open: Array<() => void>;
    data: Array<(chunk: Buffer) => void>;
    error: Array<(error: Error) => void>;
    close: Array<() => void>;
  } = {
    open: [],
    data: [],
    error: [],
    close: []
  };

  on(event: "open", listener: () => void): this;
  on(event: "data", listener: (chunk: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  on(
    event: "open" | "data" | "error" | "close",
    listener:
      | (() => void)
      | ((chunk: Buffer) => void)
      | ((error: Error) => void)
  ): this {
    if (event === "open" || event === "close") {
      this.listeners[event].push(listener as () => void);
      return this;
    }

    if (event === "data") {
      this.listeners[event].push(listener as (chunk: Buffer) => void);
      return this;
    }

    this.listeners[event].push(listener as (error: Error) => void);
    return this;
  }

  open(callback: (error?: Error | null) => void): void {
    if (this.openError) {
      callback(this.openError);
      return;
    }

    this.isOpen = true;
    callback(null);
    this.emitOpen();
  }

  close(callback?: (error?: Error | null) => void): void {
    if (this.closeError) {
      callback?.(this.closeError);
      return;
    }

    this.isOpen = false;
    callback?.(null);
    this.emitClose();
  }

  write(data: string, callback?: (error?: Error | null) => void): void {
    this.writeCalls.push(data);
    if (this.writeError) {
      callback?.(this.writeError);
      return;
    }

    callback?.(null);
  }

  removeAllListeners(): this {
    this.listeners = {
      open: [],
      data: [],
      error: [],
      close: []
    };
    return this;
  }

  emitOpen(): void {
    for (const listener of this.listeners.open) {
      listener();
    }
  }

  emitData(text: string): void {
    const chunk = Buffer.from(text, "utf8");
    for (const listener of this.listeners.data) {
      listener(chunk);
    }
  }

  emitError(message: string): void {
    const error = new Error(message);
    for (const listener of this.listeners.error) {
      listener(error);
    }
  }

  emitClose(): void {
    for (const listener of this.listeners.close) {
      listener();
    }
  }
}

describe("normalizeSerialProfile", () => {
  it("defaults to 9600 baud when omitted", () => {
    expect(normalizeSerialProfile({ path: "COM3" }).baudRate).toBe(9600);
  });

  it("enables hardware flow control in port options", () => {
    expect(
      buildSerialPortOptions({
        path: "COM4",
        flowControl: "hardware"
      }).rtscts
    ).toBe(true);
  });
});

describe("createSerialTransport", () => {
  it("emits connected, forwards io, and exits once on close", async () => {
    const fakePort = new FakeSerialPort();
    const events: SessionTransportEvent[] = [];
    const transport = createSerialTransport(
      {
        sessionId: "serial-1",
        transport: "serial",
        profileId: "COM3",
        cols: 120,
        rows: 40
      },
      {
        path: "COM3",
        localEcho: true
      },
      {
        createPort: () => fakePort
      }
    );

    transport.onEvent((event) => {
      events.push(event);
    });

    await Promise.resolve();
    transport.write("help\r");
    fakePort.emitData("device-echo");
    transport.close();
    transport.close();

    expect(fakePort.writeCalls).toEqual(["help\r"]);
    expect(events).toEqual([
      {
        type: "status",
        sessionId: "serial-1",
        state: "connected"
      },
      {
        type: "data",
        sessionId: "serial-1",
        data: "help\r"
      },
      {
        type: "data",
        sessionId: "serial-1",
        data: "device-echo"
      },
      {
        type: "exit",
        sessionId: "serial-1",
        exitCode: null
      }
    ]);
  });

  it("emits error and exit when open fails", async () => {
    const fakePort = new FakeSerialPort();
    fakePort.openError = new Error("cannot open COM7");
    const events: SessionTransportEvent[] = [];
    const transport = createSerialTransport(
      {
        sessionId: "serial-2",
        transport: "serial",
        profileId: "COM7",
        cols: 80,
        rows: 24
      },
      {
        path: "COM7"
      },
      {
        createPort: () => fakePort
      }
    );

    transport.onEvent((event) => {
      events.push(event);
    });

    await Promise.resolve();
    transport.close();

    expect(events).toEqual([
      {
        type: "error",
        sessionId: "serial-2",
        message: "cannot open COM7"
      },
      {
        type: "exit",
        sessionId: "serial-2",
        exitCode: null
      }
    ]);
  });

  it("emits write errors and skips local echo on failed writes", async () => {
    const fakePort = new FakeSerialPort();
    fakePort.writeError = new Error("write failed");
    const events: SessionTransportEvent[] = [];
    const transport = createSerialTransport(
      {
        sessionId: "serial-3",
        transport: "serial",
        profileId: "COM9",
        cols: 80,
        rows: 24
      },
      {
        path: "COM9",
        localEcho: true
      },
      {
        createPort: () => fakePort
      }
    );

    transport.onEvent((event) => {
      events.push(event);
    });

    await Promise.resolve();
    transport.write("status\r");

    expect(events).toEqual([
      {
        type: "status",
        sessionId: "serial-3",
        state: "connected"
      },
      {
        type: "error",
        sessionId: "serial-3",
        message: "write failed"
      }
    ]);
  });
});
