import { describe, expect, it, vi } from "vitest";

import {
  createClaudeSessionBinder,
  type ClaudeSessionFile,
} from "./claudeSessionBinder";

function file(
  claudeSessionId: string,
  mtimeMs: number,
  directory = "C--work-repo"
): ClaudeSessionFile {
  return { claudeSessionId, directory, mtimeMs };
}

interface Harness {
  binder: ReturnType<typeof createClaudeSessionBinder>;
  bindings: Array<[string, string | null]>;
  push: (file: ClaudeSessionFile) => void;
  watchers: number;
}

function createHarness(recent: ClaudeSessionFile[] = []): Harness {
  let onChange: ((file: ClaudeSessionFile) => void) | null = null;
  const harness: Harness = {
    bindings: [],
    watchers: 0,
    push: (changed) => onChange?.(changed),
    binder: createClaudeSessionBinder({
      now: () => 10_000,
      scanRecent: (sinceMs) =>
        Promise.resolve(recent.filter((f) => f.mtimeMs >= sinceMs)),
      watch: (listener) => {
        onChange = listener;
        harness.watchers += 1;
        return () => {
          harness.watchers -= 1;
          onChange = null;
        };
      },
    }),
  };

  harness.binder.onBinding((sessionId, claudeSessionId) => {
    harness.bindings.push([sessionId, claudeSessionId]);
  });

  return harness;
}

describe("createClaudeSessionBinder", () => {
  it("binds a tab to the conversation file written when claude appeared", async () => {
    const harness = createHarness([file("aaa", 9_000)]);

    harness.binder.handleProcessTitle("tab-1", "claude");
    await vi.waitFor(() => expect(harness.bindings).toHaveLength(1));

    expect(harness.bindings[0]).toEqual(["tab-1", "aaa"]);
    expect(harness.binder.get("tab-1")).toBe("aaa");
  });

  it("ignores a conversation last touched before claude started", async () => {
    const harness = createHarness([file("stale", 1_000)]);

    harness.binder.handleProcessTitle("tab-1", "claude");
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.bindings).toEqual([]);
    expect(harness.binder.get("tab-1")).toBeUndefined();
  });

  it("binds from a live write when the first message comes later", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("late", 20_000));

    expect(harness.bindings).toEqual([["tab-1", "late"]]);
  });

  it("never gives one conversation to two tabs", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.binder.handleProcessTitle("tab-2", "claude");

    harness.push(file("first", 20_000));
    harness.push(file("first", 21_000));
    harness.push(file("second", 22_000));

    expect(harness.bindings).toEqual([
      ["tab-1", "first"],
      ["tab-2", "second"],
    ]);
  });

  it("follows /clear onto the new conversation in the same directory", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("before-clear", 20_000, "C--work-repo"));
    harness.push(file("after-clear", 21_000, "C--work-repo"));

    expect(harness.binder.get("tab-1")).toBe("after-clear");
  });

  it("leaves a bound tab alone when the new conversation is elsewhere", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("mine", 20_000, "C--work-repo"));
    harness.push(file("someone-else", 21_000, "C--other-repo"));

    expect(harness.binder.get("tab-1")).toBe("mine");
  });

  it("gives a new conversation to a waiting tab before a bound one", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("first", 20_000, "C--work-repo"));
    harness.binder.handleProcessTitle("tab-2", "claude");
    harness.push(file("second", 21_000, "C--work-repo"));

    expect(harness.binder.get("tab-1")).toBe("first");
    expect(harness.binder.get("tab-2")).toBe("second");
  });

  it("drops the binding when claude exits, so the tab restores as a shell", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("gone", 20_000));
    harness.binder.handleProcessTitle("tab-1", null);

    expect(harness.binder.get("tab-1")).toBeUndefined();
    expect(harness.bindings.at(-1)).toEqual(["tab-1", null]);
  });

  it("keeps the binding while claude runs a tool of its own", () => {
    const harness = createHarness();

    harness.binder.handleProcessTitle("tab-1", "claude");
    harness.push(file("mine", 20_000));
    harness.binder.handleProcessTitle("tab-1", "rg");
    harness.binder.handleProcessTitle("tab-1", "claude");

    expect(harness.binder.get("tab-1")).toBe("mine");
    expect(harness.bindings).toEqual([["tab-1", "mine"]]);
  });

  it("watches only while a tab is running claude", () => {
    const harness = createHarness();

    expect(harness.watchers).toBe(0);
    harness.binder.handleProcessTitle("tab-1", "claude");
    expect(harness.watchers).toBe(1);

    harness.push(file("bound", 20_000));
    expect(harness.watchers).toBe(1);

    harness.binder.forget("tab-1");
    expect(harness.watchers).toBe(0);
  });

  it("survives an unreadable session store", async () => {
    const binder = createClaudeSessionBinder({
      now: () => 10_000,
      scanRecent: () => Promise.reject(new Error("ENOENT")),
      watch: () => null,
    });

    binder.handleProcessTitle("tab-1", "claude");
    await Promise.resolve();

    expect(binder.get("tab-1")).toBeUndefined();
  });
});
