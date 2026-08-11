/**
 * ConPTY resize-resync wiggle.
 *
 * On Windows, ConPTY reflows its internal buffer on every width change using
 * conhost's algorithm and then emits only the rows it believes changed. Any
 * terminal whose resize behavior differs from conhost's (xterm.js reflow, or
 * even reflow disabled via `windowsPty`) ends up keeping rows ConPTY silently
 * skips — visible as stale TUI fragments after a pane or window grows wider
 * (claude's right-aligned, full-width rows make it the loudest victim). The
 * divergence is created only by widening; narrowing is safe.
 *
 * ConPTY offers no "repaint everything" request, but a 2-column narrow-and-
 * restore round trip makes it (and the TUI, via its resize handler) redraw
 * enough to overwrite every stale row — verified against real claude/ConPTY
 * sessions. This module watches fit()-driven resizes and, once a burst that
 * contained any widening settles, runs that round trip.
 */

export interface ConptyResyncWiggleDeps {
  /** Resize both xterm and the pty, exactly like a fit()-driven resize. */
  resize(cols: number, rows: number): void;
  settleMs?: number;
  dwellMs?: number;
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface ConptyResyncWiggle {
  /** Report every fit()-driven resize, including no-op refits. */
  notifyResize(cols: number, rows: number): void;
  dispose(): void;
}

const DEFAULT_SETTLE_MS = 300;
const DEFAULT_DWELL_MS = 150;
const WIGGLE_COLS = 2;
const MIN_COLS_TO_WIGGLE = 10;

export function createConptyResyncWiggle(deps: ConptyResyncWiggleDeps): ConptyResyncWiggle {
  const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS;
  const dwellMs = deps.dwellMs ?? DEFAULT_DWELL_MS;
  const schedule = deps.schedule ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel = deps.cancel ?? ((handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));

  let lastCols: number | null = null;
  let sawWiden = false;
  let settleTimer: unknown = null;
  let dwellTimer: unknown = null;
  let disposed = false;

  const clearSettle = () => {
    if (settleTimer !== null) {
      cancel(settleTimer);
      settleTimer = null;
    }
  };
  const clearDwell = () => {
    if (dwellTimer !== null) {
      cancel(dwellTimer);
      dwellTimer = null;
    }
  };

  return {
    notifyResize(cols: number, rows: number): void {
      if (disposed) {
        return;
      }

      // A new resize supersedes any wiggle still in flight; its own settle
      // decides whether another one is needed.
      clearDwell();

      if (lastCols !== null && cols > lastCols) {
        sawWiden = true;
      }
      lastCols = cols;

      clearSettle();
      if (!sawWiden) {
        return;
      }

      settleTimer = schedule(() => {
        settleTimer = null;
        sawWiden = false;
        if (cols < MIN_COLS_TO_WIGGLE) {
          return;
        }
        deps.resize(cols - WIGGLE_COLS, rows);
        dwellTimer = schedule(() => {
          dwellTimer = null;
          deps.resize(cols, rows);
        }, dwellMs);
      }, settleMs);
    },

    dispose(): void {
      disposed = true;
      clearSettle();
      clearDwell();
    }
  };
}
