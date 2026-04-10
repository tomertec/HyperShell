import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import type { SessionTransportEvent } from "./transportEvents";
import { TELNET } from "./telnetParser";
import {
  createTelnetTransport,
  escapeIac,
  type SocketLike,
  type TelnetConnectionProfile,
} from "./telnetTransport";

class FakeSocket extends EventEmitter implements SocketLike {
  public writeCalls: Buffer[] = [];
  public destroyed = false;
  public connectError: Error | null = null;

  connect(port: number, host: string, callback: () => void): this {
    if (this.connectError) {
      queueMicrotask(() => {
        this.emit("error", this.connectError);
        this.emit("close");
      });
    } else {
      queueMicrotask(() => callback());
    }
    return this;
  }

  write(data: Buffer): boolean {
    this.writeCalls.push(Buffer.from(data));
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    queueMicrotask(() => this.emit("close"));
  }

  removeAllListeners(): this {
    super.removeAllListeners();
    return this;
  }
}

const makeRequest = (sessionId = "tel-1") => ({
  sessionId,
  transport: "telnet" as const,
  profileId: "test-host",
  cols: 80,
  rows: 24,
});

const flush = () => new Promise((r) => setTimeout(r, 10));

describe("createTelnetTransport — raw mode", () => {
  it("emits connected, forwards data, and exits on close", async () => {
    const socket = new FakeSocket();
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "raw",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    // Should have emitted connected
    expect(events).toContainEqual({
      type: "status",
      sessionId: "tel-1",
      state: "connected",
    });

    // Emit data from socket
    socket.emit("data", Buffer.from("Hello world"));
    await flush();

    expect(events).toContainEqual({
      type: "data",
      sessionId: "tel-1",
      data: "Hello world",
    });

    // Close transport
    transport.close();
    await flush();

    expect(events).toContainEqual({
      type: "exit",
      sessionId: "tel-1",
      exitCode: null,
    });
    expect(socket.destroyed).toBe(true);
  });

  it("resize is a no-op in raw mode", async () => {
    const socket = new FakeSocket();
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "raw",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    // resize should not throw or emit anything
    transport.resize(120, 40);
    await flush();

    // Should only have connected status, no other events
    const nonStatusEvents = events.filter(
      (e) => e.type !== "status"
    );
    expect(nonStatusEvents).toEqual([]);
  });
});

describe("createTelnetTransport — telnet mode", () => {
  it("strips IAC from incoming data and responds to negotiation", async () => {
    const socket = new FakeSocket();
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "telnet",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    // Send data with IAC WILL SGA negotiation followed by plain text
    socket.emit(
      "data",
      Buffer.from([
        TELNET.IAC, TELNET.WILL, TELNET.OPT_SGA,
        0x48, 0x69, // "Hi"
      ])
    );
    await flush();

    // Should have clean data "Hi"
    const dataEvents = events.filter((e) => e.type === "data");
    expect(dataEvents.length).toBeGreaterThanOrEqual(1);
    const allData = dataEvents
      .map((e) => (e.type === "data" ? e.data : ""))
      .join("");
    expect(allData).toBe("Hi");

    // Should have sent a DO SGA response
    const responses = socket.writeCalls;
    const doSga = responses.find(
      (buf) =>
        buf[0] === TELNET.IAC &&
        buf[1] === TELNET.DO &&
        buf[2] === TELNET.OPT_SGA
    );
    expect(doSga).toBeDefined();

    transport.close();
  });

  it("sends NAWS subnegotiation on resize when NAWS negotiated", async () => {
    const socket = new FakeSocket();
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "telnet",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    // Server requests NAWS: IAC DO NAWS
    socket.emit(
      "data",
      Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_NAWS])
    );
    await flush();

    // Clear previous writes (the parser should have sent WILL NAWS + initial NAWS)
    socket.writeCalls.length = 0;

    // Now resize
    transport.resize(132, 50);
    await flush();

    // Should have sent NAWS subnegotiation
    const nawsBuf = socket.writeCalls.find(
      (buf) =>
        buf[0] === TELNET.IAC &&
        buf[1] === TELNET.SB &&
        buf[2] === TELNET.OPT_NAWS
    );
    expect(nawsBuf).toBeDefined();
    // Check cols=132 (0x00, 0x84) and rows=50 (0x00, 0x32)
    expect(nawsBuf![3]).toBe(0);
    expect(nawsBuf![4]).toBe(132);
    expect(nawsBuf![5]).toBe(0);
    expect(nawsBuf![6]).toBe(50);

    transport.close();
  });

  it("escapes 0xFF bytes in user write", async () => {
    // Unit-test the escapeIac helper directly with known input
    // "A" + 0xFF + "B" encoded as latin1 so the 0xFF byte survives
    const input = Buffer.from([0x41, 0xff, 0x42]).toString("latin1");
    const escaped = escapeIac(input);
    expect(escaped).toEqual(Buffer.from([0x41, 0xff, 0xff, 0x42]));

    // Integration: verify telnet-mode write goes through escapeIac
    const socket = new FakeSocket();
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "telnet",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });

    await flush();

    // Write plain ASCII — should pass through unchanged
    transport.write("hello");
    const lastWrite = socket.writeCalls[socket.writeCalls.length - 1];
    expect(lastWrite).toEqual(Buffer.from("hello"));

    transport.close();
  });
});

describe("createTelnetTransport — error handling", () => {
  it("emits error and exit when connection fails", async () => {
    const socket = new FakeSocket();
    socket.connectError = new Error("Connection refused");
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "raw",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    expect(events).toContainEqual({
      type: "error",
      sessionId: "tel-1",
      message: "Connection refused",
    });
    expect(events).toContainEqual({
      type: "exit",
      sessionId: "tel-1",
      exitCode: null,
    });
  });

  it("emits only one exit event on multiple close calls", async () => {
    const socket = new FakeSocket();
    const events: SessionTransportEvent[] = [];
    const profile: TelnetConnectionProfile = {
      hostname: "192.168.1.1",
      port: 23,
      mode: "raw",
    };

    const transport = createTelnetTransport(makeRequest(), profile, {
      createSocket: () => socket,
    });
    transport.onEvent((e) => events.push(e));

    await flush();

    transport.close();
    await flush();
    transport.close();
    await flush();

    const exitEvents = events.filter((e) => e.type === "exit");
    expect(exitEvents).toHaveLength(1);
  });
});
