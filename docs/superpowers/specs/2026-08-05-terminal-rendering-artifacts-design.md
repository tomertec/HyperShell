# Terminal Rendering Artifacts Design

## Goal

Eliminate terminal ghost text and stale row fragments during incremental TUI
updates while preserving correct PTY cursor semantics.

## Evidence and Revised Diagnosis

The original renderer hypothesis is refuted by live testing. HyperShell was
restarted from the rebuilt Electron bundle with optional WebGL rendering,
xterm-owned screen geometry, transparent renderer canvases, and a coalesced
full-viewport `refresh()` after parsed output at fractional display scaling.
Artifacts still appeared, while changing the terminal dimensions cleared them.

The shared configuration instead forces `convertEol: true` for every terminal.
xterm documents this option as equivalent to converting every `\n` to `\r\n`
and says it should normally not be used for PTY data because the PTY's termios
settings own that translation. Forcing it means a full-screen application
cannot preserve a nonzero cursor column across a line feed, even when its PTY
mode requires that behavior. Incremental redraws can therefore update the wrong
cells and leave old text behind; a resize makes the application draw the whole
screen again.

Reference: https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/#converteol

## Scope

- Restore xterm's PTY-safe default by setting `convertEol` to `false`.
- Add an automated regression test that writes `abc\nx` and proves the `x`
  remains in column 3 instead of being forced to column 0.
- Keep the current renderer and repaint changes unchanged for the first live
  validation so newline handling is the only changed variable.
- Rebuild the UI and sync it into the Electron renderer bundle.

## Design

`terminalOptions` remains the single source of xterm defaults. Its
`convertEol` value changes from `true` to `false`; no transport-specific branch
is needed because every HyperShell terminal is fed a terminal-protocol byte
stream from a PTY or terminal peer rather than plain line-oriented text.

The regression test opens a real xterm instance with `getTerminalOptions()`,
writes a line feed while the cursor is at column 3, waits for parsing to finish,
and inspects the public buffer API. This tests the externally visible terminal
state rather than the implementation detail of the option value.

## Validation and Cleanup

Automated validation covers the focused regression, all UI unit tests, browser
tests, the production build, renderer synchronization, and the real Electron
local-PTY smoke test. The final acceptance check remains the original streaming
TUI reproduction because automated browser tests cannot prove the absence of a
timing-dependent artifact in the user's SSH workload.

The fractional-scale repaint guard is retained only during this one-variable
validation. If live testing confirms the PTY-semantics fix, remove that failed
workaround in a separate follow-up and rerun the same gates. If artifacts remain,
stop changing rendering options and add diagnostic capture that compares
xterm's buffer contents with the visible surface.

## Non-Goals

- Disabling Electron GPU acceleration globally.
- Adding a renderer preference to Settings.
- Changing font metrics, Unicode width handling, or transport byte streams.
- Combining cleanup of the previous renderer experiments with this hypothesis
  test.
