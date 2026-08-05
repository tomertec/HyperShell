# Terminal Rendering Artifacts Design

## Goal

Eliminate terminal ghost glyphs and row artifacts at fractional Windows display
scaling without making terminal availability depend on GPU rendering.

## Scope

- Prefer xterm's WebGL renderer after the terminal has opened.
- Preserve xterm's built-in DOM renderer as the automatic fallback when the
  WebGL module cannot load, WebGL initialization fails, or its context is lost.
- Keep terminal backgrounds on the terminal container, xterm root, viewport,
  and xterm theme. Never paint xterm's renderer canvases with CSS or inline
  styles because WebGL uses transparent overlay canvases.
- Let xterm calculate `.xterm-screen` height from its rows and cell metrics;
  application CSS must not override that height.
- Retain the Unicode 15 grapheme addon. It solves character-width drift and is
  complementary to the renderer change.

## Design

The renderer activation is isolated in a small asynchronous helper. It accepts
an already-open xterm instance, dynamically imports `@xterm/addon-webgl`,
registers context-loss disposal, and loads the addon. Every failure is contained
inside the helper, leaving the already-running DOM renderer untouched. If addon
activation fails after construction, the helper disposes the partially created
addon.

`useTerminalSession` initializes the required xterm, fit, search, and Unicode
modules as it does today. Immediately after `open()`, it starts optional WebGL
activation without blocking terminal input or session startup.

## Error Handling

- A WebGL import or activation failure is intentionally silent and falls back
  to the DOM renderer.
- A WebGL context loss disposes the addon; xterm restores its DOM renderer.
- Terminal disposal remains the owner of successfully loaded addon cleanup.

## Testing

- Unit-test successful addon activation and context-loss disposal.
- Unit-test rejected module loading and addon activation failure to prove the
  fallback resolves without rejecting.
- Run terminal unit tests and the UI production build.
- Manually verify the original reproduction at Windows 100% and 115% display
  scaling, including resize, tab switching, font-size changes, and theme changes.
  Automated tests cannot establish that GPU pixels are artifact-free.

## Non-Goals

- Adding a renderer preference to Settings.
- Changing terminal font metrics or Unicode width behavior.
- Adding forced refresh calls after every write or resize.
