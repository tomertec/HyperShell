import type { Terminal } from "@xterm/xterm";

type RepaintTerminal = Pick<Terminal, "onWriteParsed" | "refresh" | "rows">;

interface RepaintGuardOptions {
  devicePixelRatio?: number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

const INTEGER_SCALE_EPSILON = 0.001;

function usesFractionalDeviceScale(devicePixelRatio: number): boolean {
  return Math.abs(devicePixelRatio - Math.round(devicePixelRatio)) > INTEGER_SCALE_EPSILON;
}

/**
 * Chromium can occasionally leave stale xterm canvas damage behind at a
 * fractional device scale. A window resize clears it because xterm repaints
 * the entire viewport. Do the same after parsed output, coalesced to one extra
 * repaint per animation frame, without resizing the PTY or touching its data.
 */
export function installTerminalRepaintGuard(
  terminal: RepaintTerminal,
  options: RepaintGuardOptions = {}
): { dispose(): void } {
  const devicePixelRatio = options.devicePixelRatio ?? window.devicePixelRatio;
  if (!usesFractionalDeviceScale(devicePixelRatio)) {
    return { dispose() {} };
  }

  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let pendingFrame: number | null = null;
  let disposed = false;

  const writeSubscription = terminal.onWriteParsed(() => {
    if (pendingFrame !== null) {
      return;
    }

    pendingFrame = requestFrame(() => {
      pendingFrame = null;
      if (!disposed && terminal.rows > 0) {
        terminal.refresh(0, terminal.rows - 1);
      }
    });
  });

  return {
    dispose() {
      disposed = true;
      writeSubscription.dispose();
      if (pendingFrame !== null) {
        cancelFrame(pendingFrame);
        pendingFrame = null;
      }
    }
  };
}
