import { describe, expect, it } from "vitest";

import { TelnetParser, TELNET } from "./telnetParser";

function collectEvents(parser: TelnetParser) {
  const data: Buffer[] = [];
  const send: Buffer[] = [];
  parser.on("data", (buf) => data.push(Buffer.from(buf)));
  parser.on("send", (buf) => send.push(Buffer.from(buf)));
  return { data, send };
}

describe("TelnetParser", () => {
  it("passes plain text through unchanged", () => {
    const parser = new TelnetParser();
    const { data } = collectEvents(parser);
    parser.feed(Buffer.from("Hello, world!"));
    expect(Buffer.concat(data).toString()).toBe("Hello, world!");
  });

  it("IAC WILL SGA → strips from data, emits DO SGA response", () => {
    const parser = new TelnetParser();
    const { data, send } = collectEvents(parser);
    parser.feed(Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_SGA]));
    expect(Buffer.concat(data).length).toBe(0);
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_SGA])
    );
  });

  it("DO NAWS → responds WILL NAWS + sends initial window size", () => {
    const parser = new TelnetParser({ cols: 80, rows: 24 });
    const { send } = collectEvents(parser);
    parser.feed(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_NAWS]));
    expect(send).toHaveLength(2);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_NAWS])
    );
    // IAC SB NAWS 0 80 0 24 IAC SE
    expect(send[1]).toEqual(
      Buffer.from([
        TELNET.IAC, TELNET.SB, TELNET.OPT_NAWS,
        0, 80, 0, 24,
        TELNET.IAC, TELNET.SE,
      ])
    );
  });

  it("WILL ECHO → responds DO ECHO", () => {
    const parser = new TelnetParser();
    const { send } = collectEvents(parser);
    parser.feed(Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.OPT_ECHO]));
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_ECHO])
    );
  });

  it("unknown DO → responds WONT", () => {
    const parser = new TelnetParser();
    const { send } = collectEvents(parser);
    const unknownOpt = 0x99;
    parser.feed(Buffer.from([TELNET.IAC, TELNET.DO, unknownOpt]));
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.WONT, unknownOpt])
    );
  });

  it("unknown WILL → responds DONT", () => {
    const parser = new TelnetParser();
    const { send } = collectEvents(parser);
    const unknownOpt = 0x99;
    parser.feed(Buffer.from([TELNET.IAC, TELNET.WILL, unknownOpt]));
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.DONT, unknownOpt])
    );
  });

  it("handles split buffer boundaries (IAC split across two feeds)", () => {
    const parser = new TelnetParser();
    const { data, send } = collectEvents(parser);
    // Send IAC in one feed, WILL SGA in the next
    parser.feed(Buffer.from([TELNET.IAC]));
    parser.feed(Buffer.from([TELNET.WILL, TELNET.OPT_SGA]));
    expect(Buffer.concat(data).length).toBe(0);
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_SGA])
    );
  });

  it("mixed data and IAC sequences — data is concatenated without IAC", () => {
    const parser = new TelnetParser();
    const { data } = collectEvents(parser);
    const buf = Buffer.from([
      ...Buffer.from("Hi"),
      TELNET.IAC, TELNET.WILL, TELNET.OPT_SGA,
      ...Buffer.from("there"),
    ]);
    parser.feed(buf);
    expect(Buffer.concat(data).toString()).toBe("Hithere");
  });

  it("subnegotiation content is skipped", () => {
    const parser = new TelnetParser();
    const { data } = collectEvents(parser);
    const buf = Buffer.from([
      ...Buffer.from("A"),
      TELNET.IAC, TELNET.SB, 0x18, // TERMINAL-TYPE
      0x00, 0x78, 0x74, 0x65, 0x72, 0x6d, // some sub data
      TELNET.IAC, TELNET.SE,
      ...Buffer.from("B"),
    ]);
    parser.feed(buf);
    expect(Buffer.concat(data).toString()).toBe("AB");
  });

  it("sendNaws sends correct bytes when NAWS negotiated", () => {
    const parser = new TelnetParser({ cols: 80, rows: 24 });
    const { send } = collectEvents(parser);
    // First negotiate NAWS
    parser.feed(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.OPT_NAWS]));
    send.length = 0; // clear negotiation responses

    parser.sendNaws(132, 43);
    expect(send).toHaveLength(1);
    expect(send[0]).toEqual(
      Buffer.from([
        TELNET.IAC, TELNET.SB, TELNET.OPT_NAWS,
        0, 132, 0, 43,
        TELNET.IAC, TELNET.SE,
      ])
    );
  });

  it("sendNaws is no-op when NAWS not negotiated", () => {
    const parser = new TelnetParser();
    const { send } = collectEvents(parser);
    parser.sendNaws(80, 24);
    expect(send).toHaveLength(0);
  });

  it("IAC IAC → emits literal 0xFF byte", () => {
    const parser = new TelnetParser();
    const { data } = collectEvents(parser);
    parser.feed(Buffer.from([TELNET.IAC, TELNET.IAC]));
    expect(Buffer.concat(data)).toEqual(Buffer.from([0xff]));
  });
});
