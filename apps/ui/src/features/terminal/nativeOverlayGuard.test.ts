import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";
import { acquireOverlayGuard, useOverlayGuard } from "./nativeOverlayGuard";

function guardCalls(calls: { method: string; args: unknown[] }[]): unknown[] {
  return calls.filter((c) => c.method === "ghosttyOverlayGuard").map((c) => c.args[0]);
}

// Fake timers everywhere: `release()` always schedules a real setTimeout for
// the eventual hidden:false when it isn't under fake timers, and that timer
// would otherwise fire mid-way through a later test (it reads whatever shell
// is current via getShell() at fire time) and contaminate its assertions.
// `vi.useRealTimers()` in afterEach discards any timer left pending under
// fake timers, so an un-advanced release() here is always harmless.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setShell(null);
});

describe("acquireOverlayGuard", () => {
  test("the first acquire (0->1) hides native surfaces immediately", () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const release = acquireOverlayGuard();

    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);

    release();
  });

  test("a second acquire while one is already active does not send another hide call", () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const releaseA = acquireOverlayGuard();
    const releaseB = acquireOverlayGuard();

    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);

    releaseA();
    releaseB();
  });

  test("releasing one of two acquires (2->1) keeps surfaces hidden", () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const releaseA = acquireOverlayGuard();
    const releaseB = acquireOverlayGuard();
    releaseA();

    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);

    releaseB();
  });

  test("releasing the last acquire (1->0) does not immediately show surfaces", () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const release = acquireOverlayGuard();
    release();

    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);
  });

  test("releasing the last acquire shows surfaces after the 50ms delay", async () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const release = acquireOverlayGuard();
    release();

    await vi.advanceTimersByTimeAsync(50);

    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }, { hidden: false }]);
  });

  test("a modal-to-modal transition within the delay window never flashes surfaces visible", async () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const releaseFirst = acquireOverlayGuard();
    releaseFirst();
    // A new overlay acquires before the pending 50ms release fires.
    const releaseSecond = acquireOverlayGuard();

    await vi.advanceTimersByTimeAsync(50);

    expect(guardCalls(fake.calls)).not.toContainEqual({ hidden: false });

    releaseSecond();
    await vi.advanceTimersByTimeAsync(50);
  });

  test("does nothing and does not throw when no shell bridge is present", () => {
    setShell(null);

    expect(() => {
      const release = acquireOverlayGuard();
      release();
    }).not.toThrow();
  });
});

describe("useOverlayGuard", () => {
  test("acquires while active and releases (after the delay) once inactive", async () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const { rerender } = renderHook(({ active }) => useOverlayGuard(active), {
      initialProps: { active: false }
    });
    expect(guardCalls(fake.calls)).toEqual([]);

    rerender({ active: true });
    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);

    rerender({ active: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }, { hidden: false }]);
  });

  test("releases on unmount while still active", async () => {
    const fake = createFakeShell();
    setShell(fake.shell);

    const { unmount } = renderHook(() => useOverlayGuard(true));
    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }]);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(guardCalls(fake.calls)).toEqual([{ hidden: true }, { hidden: false }]);
  });
});
