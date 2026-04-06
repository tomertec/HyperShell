# Windows Smoke Checklist

Use this checklist on a packaged Windows build and record results in [windows-smoke-execution-sheet.md](./windows-smoke-execution-sheet.md).

## Run Metadata

- Date:
- Tester:
- Build version:
- Artifact filename:
- Signed (`yes` / `no`):
- Release candidate:

## App launch

- Start the app and confirm the main workbench opens.
- Confirm the tray icon appears after startup.
- Confirm `Ctrl+K` opens Quick Connect.

## Terminal

- Open one SSH session from Quick Connect.
- Confirm `vim`, `tmux`, and `htop` render correctly in the terminal.
- Resize the window and confirm the terminal resizes with it.

## SSH

- Test password authentication.
- Test key-based authentication.
- Test agent-based authentication with the Windows OpenSSH agent or 1Password SSH Agent.
- Test one host imported from `~/.ssh/config`.

## Serial

- Open a serial profile on a real COM port.
- Confirm local echo works when enabled.
- Toggle DTR and RTS if the device requires reset or boot mode control.

## Recovery

- Open at least two sessions.
- Trigger a disconnect and confirm the session state updates.
- Restart the app and confirm recoverable sessions are surfaced again.

## Broadcast

- Enable broadcast mode.
- Confirm the app shows a persistent warning banner.
- Verify input goes only to the selected broadcast targets.

## Result

- Overall status (`pass` / `fail`):
- Notes and regressions:
- Evidence links recorded in execution sheet:
