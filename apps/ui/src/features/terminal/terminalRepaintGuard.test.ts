import { describe, expect, it, vi } from "vitest";

import { installTerminalRepaintGuard } from "./terminalRepaintGuard";

function createTerminal(rows = 24) {
  let onWriteParsed: (() => void) | undefined;
  const dispose = vi.fn();
  const terminal = {
    rows,
    refresh: vi.fn(),
    onWriteParsed: vi.fn((listener: () => void) => {
      onWriteParsed = listener;
      return { dispose };
    })
  };

  return {
    terminal,
    emitWriteParsed: () => onWriteParsed?.(),
    disposeSubscription: dispose
  };
}

describe("installTerminalRepaintGuard", () => {
  it("coalesces parsed output into one full viewport repaint per frame", () => {
    const { terminal, emitWriteParsed } = createTerminal();
    let scheduledFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 7;
    });

    installTerminalRepaintGuard(terminal, {
      devicePixelRatio: 1.145833,
      requestFrame,
      cancelFrame: vi.fn()
    });
    emitWriteParsed();
    emitWriteParsed();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(terminal.refresh).not.toHaveBeenCalled();

    scheduledFrame?.(0);

    expect(terminal.refresh).toHaveBeenCalledOnce();
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
  });

  it("does not install the workaround at an integer device scale", () => {
    const { terminal } = createTerminal();

    const disposable = installTerminalRepaintGuard(terminal, {
      devicePixelRatio: 2,
      requestFrame: vi.fn(),
      cancelFrame: vi.fn()
    });

    expect(terminal.onWriteParsed).not.toHaveBeenCalled();
    disposable.dispose();
  });

  it("cancels a queued repaint when disposed", () => {
    const { terminal, emitWriteParsed, disposeSubscription } = createTerminal();
    const cancelFrame = vi.fn();

    const disposable = installTerminalRepaintGuard(terminal, {
      devicePixelRatio: 1.25,
      requestFrame: vi.fn(() => 9),
      cancelFrame
    });
    emitWriteParsed();
    disposable.dispose();

    expect(cancelFrame).toHaveBeenCalledWith(9);
    expect(disposeSubscription).toHaveBeenCalledOnce();
  });
});
