import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createConptyResyncWiggle } from "./conptyResyncWiggle";

describe("createConptyResyncWiggle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const resize = vi.fn();
    const wiggle = createConptyResyncWiggle({ resize, settleMs: 300, dwellMs: 150 });
    return { resize, wiggle };
  }

  it("does not wiggle on the initial resize", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(140, 40);
    vi.advanceTimersByTime(1000);
    expect(resize).not.toHaveBeenCalled();
  });

  it("wiggles cols-2 then restores after a widening settles", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(100, 40);
    wiggle.notifyResize(140, 40);
    vi.advanceTimersByTime(300);
    expect(resize).toHaveBeenNthCalledWith(1, 138, 40);
    vi.advanceTimersByTime(150);
    expect(resize).toHaveBeenNthCalledWith(2, 140, 40);
    expect(resize).toHaveBeenCalledTimes(2);
  });

  it("does not wiggle after narrowing", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(140, 40);
    wiggle.notifyResize(100, 40);
    vi.advanceTimersByTime(1000);
    expect(resize).not.toHaveBeenCalled();
  });

  it("does not wiggle on a same-size refit", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(140, 40);
    vi.advanceTimersByTime(1000);
    wiggle.notifyResize(140, 40);
    vi.advanceTimersByTime(1000);
    expect(resize).not.toHaveBeenCalled();
  });

  it("wiggles when a burst ends narrower but contained a widening", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(100, 40);
    wiggle.notifyResize(120, 40); // widen mid-drag
    wiggle.notifyResize(90, 40); // ends narrower than it started
    vi.advanceTimersByTime(300);
    expect(resize).toHaveBeenNthCalledWith(1, 88, 40);
    vi.advanceTimersByTime(150);
    expect(resize).toHaveBeenNthCalledWith(2, 90, 40);
  });

  it("restarts the settle window while resizes keep arriving", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(100, 40);
    wiggle.notifyResize(120, 40);
    vi.advanceTimersByTime(200);
    wiggle.notifyResize(130, 40);
    vi.advanceTimersByTime(200);
    expect(resize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(resize).toHaveBeenNthCalledWith(1, 128, 40);
  });

  it("cancels a pending restore when a new resize arrives mid-wiggle", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(100, 40);
    wiggle.notifyResize(140, 40);
    vi.advanceTimersByTime(300); // wiggle to 138 issued
    wiggle.notifyResize(120, 40); // user resized again before restore
    vi.advanceTimersByTime(1000);
    // no restore to 140; the narrower settle needs no wiggle of its own
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenNthCalledWith(1, 138, 40);
  });

  it("skips degenerate widths", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(4, 40);
    wiggle.notifyResize(8, 40);
    vi.advanceTimersByTime(1000);
    expect(resize).not.toHaveBeenCalled();
  });

  it("does nothing after dispose", () => {
    const { resize, wiggle } = setup();
    wiggle.notifyResize(100, 40);
    wiggle.notifyResize(140, 40);
    wiggle.dispose();
    vi.advanceTimersByTime(1000);
    expect(resize).not.toHaveBeenCalled();
  });
});
