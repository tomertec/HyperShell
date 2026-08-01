import { expect, test } from "@playwright/test";
import { createServer, type Server, type Socket } from "node:net";

import {
  closeApp,
  createDataDir,
  launchApp,
  removeDataDir,
  type LaunchedApp
} from "./electronHarness";

/**
 * A throwaway TCP echo server standing in for a remote host. The telnet
 * transport in `raw` mode is a plain socket passthrough with no external
 * binary and no negotiation, which makes it the one transport that can drive a
 * complete, deterministic session lifecycle — open, connected, write, data
 * back, close — with nothing mocked out inside the app itself. The SSH
 * transport shells out to the system `ssh`, and serial needs hardware.
 */
interface EchoServer {
  port: number;
  server: Server;
  sockets: Socket[];
  /** Number of client connections the server has seen close. */
  closedConnections: () => number;
}

function startEchoServer(): Promise<EchoServer> {
  return new Promise((resolve, reject) => {
    const sockets: Socket[] = [];
    let closed = 0;

    const server = createServer((socket) => {
      sockets.push(socket);
      socket.on("data", (chunk) => {
        socket.write(Buffer.from(`echo:${chunk.toString("utf8")}`));
      });
      socket.on("close", () => {
        closed += 1;
      });
      socket.on("error", () => {
        // A client vanishing mid-test is the close path under test.
      });
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Echo server did not bind a TCP port"));
        return;
      }
      resolve({ port: address.port, server, sockets, closedConnections: () => closed });
    });
  });
}

let launched: LaunchedApp;
let echo: Awaited<ReturnType<typeof startEchoServer>>;

test.beforeEach(async () => {
  echo = await startEchoServer();
  launched = await launchApp(createDataDir());

  // Collect every session event the main process pushes at the renderer so the
  // assertions can look at the whole lifecycle, not just the latest event.
  await launched.page.evaluate(() => {
    const received: unknown[] = [];
    (window as unknown as { __sessionEvents: unknown[] }).__sessionEvents = received;
    window.hypershell.onSessionEvent((event) => {
      received.push(event);
    });
  });
});

test.afterEach(async () => {
  await closeApp(launched.app);
  removeDataDir(launched.dataDir);

  for (const socket of echo.sockets) {
    socket.destroy();
  }
  await new Promise<void>((resolve) => echo.server.close(() => resolve()));
});

test("opens, exchanges data on, and closes a session end to end", async () => {
  const opened = await launched.page.evaluate(
    (port) =>
      window.hypershell.openSession({
        transport: "telnet",
        profileId: "e2e-echo",
        cols: 80,
        rows: 24,
        telnetOptions: { hostname: "127.0.0.1", port, mode: "raw" }
      }),
    echo.port
  );

  expect(opened.sessionId).toBeTruthy();
  const { sessionId } = opened;

  // The transport reports connected asynchronously, once the socket is up.
  await expect
    .poll(() =>
      launched.page.evaluate(
        (id) =>
          (window as unknown as { __sessionEvents: { type: string; sessionId: string; state?: string }[] }).__sessionEvents
            .filter((event) => event.sessionId === id && event.type === "status")
            .map((event) => event.state),
        sessionId
      )
    )
    .toContain("connected");

  await launched.page.evaluate(
    ({ id, data }) => window.hypershell.writeSession({ sessionId: id, data }),
    { id: sessionId, data: "hello\n" }
  );

  // The echo server prefixes what it receives, so seeing it back proves the
  // full round trip: renderer → IPC → session manager → socket → and back.
  await expect
    .poll(() =>
      launched.page.evaluate(
        (id) =>
          (window as unknown as { __sessionEvents: { type: string; sessionId: string; data?: string }[] }).__sessionEvents
            .filter((event) => event.sessionId === id && event.type === "data")
            .map((event) => event.data)
            .join(""),
        sessionId
      )
    )
    .toContain("echo:hello");

  await launched.page.evaluate(
    (id) => window.hypershell.closeSession({ sessionId: id }),
    sessionId
  );

  // Asserted from the server's side of the wire. A caller-initiated close emits
  // no terminal event to the renderer: SessionManager.close() calls
  // transport.close() and then unsubscribes synchronously, while the socket's
  // 'close' (and the transport's 'exit') lands a tick later, so the event has
  // nowhere to go. The renderer that asked for the close already knows, so this
  // is the contract as written — but it means "the socket really went away" can
  // only be verified out-of-band, which is exactly what this does.
  await expect.poll(() => echo.closedConnections(), { timeout: 10_000 }).toBe(1);
});

test("reports an error for a session whose target refuses the connection", async () => {
  // Close the listener first so the port is guaranteed to refuse.
  await new Promise<void>((resolve) => echo.server.close(() => resolve()));

  const opened = await launched.page.evaluate(
    (port) =>
      window.hypershell.openSession({
        transport: "telnet",
        profileId: "e2e-refused",
        cols: 80,
        rows: 24,
        telnetOptions: { hostname: "127.0.0.1", port, mode: "raw" }
      }),
    echo.port
  );

  await expect
    .poll(
      () =>
        launched.page.evaluate(
          (id) =>
            (window as unknown as { __sessionEvents: { type: string; sessionId: string }[] }).__sessionEvents
              .filter((event) => event.sessionId === id)
              .map((event) => event.type),
          opened.sessionId
        ),
      { timeout: 20_000 }
    )
    .toContain("error");
});

test("rejects a session request that fails schema validation", async () => {
  const error = await launched.page.evaluate(async () => {
    try {
      await window.hypershell.openSession({
        transport: "telnet",
        profileId: "e2e-bad",
        // cols must be a positive integer.
        cols: 0,
        rows: 24,
        telnetOptions: { hostname: "127.0.0.1", port: 23, mode: "raw" }
      });
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  });

  expect(error).not.toBeNull();
});
