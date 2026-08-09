# Per-Tab Terminal Font Size Design

## Goal

Give every terminal tab its own font size and preserve that size through clean app restarts and named workspace restoration.

## State Model

- Store `fontSize` on `LayoutTab`, the existing source of truth for terminal-tab state.
- Initialize new terminal tabs from the current global terminal font size.
- Keep the workspace `fontSize` field optional so existing saved workspaces remain valid and inherit the current global default when restored.
- Do not add font-size state to SFTP or editor tabs.

## Behavior

- `Ctrl/Cmd +` and `Ctrl/Cmd -` change only the terminal tab receiving the shortcut.
- `Ctrl/Cmd 0` resets only that tab to the current global terminal font size.
- Settings > Terminal > Size becomes the default for future tabs; changing it does not resize existing tabs.
- Session-ID replacement preserves the tab's font size.
- SSH, local, serial, and Telnet terminal tabs share the same behavior.

## Persistence

- Include each terminal tab's `fontSize` in automatic last-workspace serialization.
- Include it in named workspace save/load flows.
- Extend the shared workspace schema and database-side layout type with an optional, bounded half-pixel value.
- Restore older workspace records without `fontSize` using the current global default.

## Testing

- Prove new tabs capture the configured default.
- Prove resizing one tab does not change another tab.
- Prove font size survives session-ID replacement.
- Prove workspace schemas accept supported half-pixel sizes, reject invalid sizes, and remain backward compatible.
- Prove automatic and named workspace serialization/restoration carry the per-tab value.
- Run focused unit tests, the UI suite, relevant shared/desktop tests, and builds available without rebuilding native dependencies.

