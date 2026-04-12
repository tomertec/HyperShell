import { describe, it, expect } from "vitest";
import { searchCommands, type Command } from "./searchCommands";

const commands: Command[] = [
  {
    id: "settings.open",
    title: "Open Settings",
    category: "Navigation",
    visible: () => true,
    execute: () => {},
    keywords: ["preferences", "config"],
  },
  {
    id: "layout.split-horizontal",
    title: "Split Pane Horizontal",
    category: "Layout",
    shortcut: "Ctrl+Shift+D",
    visible: () => true,
    execute: () => {},
  },
  {
    id: "session.disconnect",
    title: "Disconnect Active Session",
    category: "Session",
    visible: () => false,
    execute: () => {},
    keywords: ["close", "end"],
  },
];

describe("searchCommands", () => {
  it("returns all visible commands for empty query", () => {
    const results = searchCommands(commands, "");
    expect(results.map((c) => c.id)).toEqual(["settings.open", "layout.split-horizontal"]);
  });

  it("fuzzy matches on title", () => {
    const results = searchCommands(commands, "split");
    expect(results[0].id).toBe("layout.split-horizontal");
  });

  it("matches on keywords", () => {
    const results = searchCommands(commands, "preferences");
    expect(results[0].id).toBe("settings.open");
  });

  it("matches on category", () => {
    const results = searchCommands(commands, "layout");
    expect(results[0].id).toBe("layout.split-horizontal");
  });

  it("excludes invisible commands", () => {
    const results = searchCommands(commands, "disconnect");
    expect(results).toHaveLength(0);
  });
});
