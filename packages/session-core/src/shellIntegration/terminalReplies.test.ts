import { describe, expect, it } from "vitest";

import { isAutomaticTerminalReply } from "./terminalReplies";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("isAutomaticTerminalReply", () => {
  it("recognises the answers a terminal sends on its own", () => {
    // The one that broke Claude resume: ConPTY enables focus reporting, so the
    // terminal reports focus-out as soon as the user clicks anything else.
    expect(isAutomaticTerminalReply(`${ESC}[O`)).toBe(true);
    expect(isAutomaticTerminalReply(`${ESC}[I`)).toBe(true);
    // Cursor position, device attributes, device status.
    expect(isAutomaticTerminalReply(`${ESC}[24;80R`)).toBe(true);
    expect(isAutomaticTerminalReply(`${ESC}[?62;4c`)).toBe(true);
    expect(isAutomaticTerminalReply(`${ESC}[>0;10;1c`)).toBe(true);
    expect(isAutomaticTerminalReply(`${ESC}[0n`)).toBe(true);
    // DCS and OSC answers.
    expect(isAutomaticTerminalReply(`${ESC}P>|xterm${ESC}\\`)).toBe(true);
    expect(isAutomaticTerminalReply(`${ESC}]11;rgb:0000/0000/0000${BEL}`)).toBe(true);
  });

  it("recognises several replies arriving in one write", () => {
    expect(isAutomaticTerminalReply(`${ESC}[O${ESC}[24;80R${ESC}[I`)).toBe(true);
  });

  it("treats an empty write as saying nothing about the user", () => {
    expect(isAutomaticTerminalReply("")).toBe(true);
  });

  it("treats anything the user could have typed as input", () => {
    expect(isAutomaticTerminalReply("git status")).toBe(false);
    expect(isAutomaticTerminalReply("\r")).toBe(false);
    expect(isAutomaticTerminalReply(String.fromCharCode(3))).toBe(false);
    // Escape on its own, and the arrow keys that share the CSI prefix — a
    // wrong guess here would corrupt a command the user is building.
    expect(isAutomaticTerminalReply(ESC)).toBe(false);
    expect(isAutomaticTerminalReply(`${ESC}[A`)).toBe(false);
    expect(isAutomaticTerminalReply(`${ESC}[3~`)).toBe(false);
    // A real reply followed by real typing is still typing.
    expect(isAutomaticTerminalReply(`${ESC}[Ols`)).toBe(false);
  });
});
