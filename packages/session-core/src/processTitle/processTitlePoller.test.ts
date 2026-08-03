import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProcessTitlePoller } from "./processTitlePoller";
import type { ProcessNode } from "./foregroundProcess";

const tree = (child?: string): ProcessNode => ({
  pid: 1,
  name: "pwsh.exe",
  children: child ? [{ pid: 2, name: child, children: [] }] : []
});

describe("createProcessTitlePoller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the foreground name on the first tick", async () => {
    const poller = createProcessTitlePoller({
      provider: async () => tree("llmtop.exe"),
      intervalMs: 1000
    });
    const seen: Array<[string, string | null]> = [];
    poller.onChange((sessionId, name) => seen.push([sessionId, name]));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual([["s1", "llmtop"]]);
    poller.stop();
  });

  it("emits only when the name changes", async () => {
    let current = "llmtop.exe";
    const poller = createProcessTitlePoller({
      provider: async () => tree(current),
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(3000);
    current = "htop.exe";
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop", "htop"]);
    poller.stop();
  });

  it("emits null when the program exits back to the prompt", async () => {
    let child: string | undefined = "llmtop.exe";
    const poller = createProcessTitlePoller({
      provider: async () => tree(child),
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    child = undefined;
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop", null]);
    poller.stop();
  });

  it("stops polling once the last session unregisters", async () => {
    const provider = vi.fn(async () => tree("llmtop.exe"));
    const poller = createProcessTitlePoller({ provider, intervalMs: 1000 });

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider).toHaveBeenCalledTimes(1);

    poller.unregister("s1");
    await vi.advanceTimersByTimeAsync(5000);
    expect(provider).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("survives a provider rejection and keeps polling", async () => {
    let fail = true;
    const poller = createProcessTitlePoller({
      provider: async () => {
        if (fail) throw new Error("boom");
        return tree("llmtop.exe");
      },
      intervalMs: 1000
    });
    const seen: Array<string | null> = [];
    poller.onChange((_sessionId, name) => seen.push(name));

    poller.register("s1", 1);
    await vi.advanceTimersByTimeAsync(1000);
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);

    expect(seen).toEqual(["llmtop"]);
    poller.stop();
  });
});
