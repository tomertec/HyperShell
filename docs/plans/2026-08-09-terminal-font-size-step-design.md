# Terminal Font Size Step Design

## Goal

Make terminal font-size changes from `Ctrl/Cmd +` and `Ctrl/Cmd -` more precise by reducing each change from 1 px to 0.5 px.

## Design

- Keep the existing shortcut recognition and `Ctrl/Cmd 0` reset behavior.
- Change terminal shortcut adjustments to `+0.5` px and `-0.5` px.
- Preserve font sizes to the nearest 0.5 px instead of rounding them to whole pixels.
- Keep the existing minimum of 8 px, maximum of 32 px, and default/reset value of 13 px.
- Populate the terminal Size dropdown in 0.5 px increments so persisted shortcut values remain visible and selectable.
- Leave the editor font-size shortcuts and controls unchanged; they use a separate store and UI.

## Testing

- Add store-level tests that prove 0.5 px increases and decreases are retained and clamped at the existing bounds.
- Add normalization coverage to prove arbitrary values round to the nearest 0.5 px.
- Run the focused settings/shortcut unit tests, the UI test suite, and the UI build.

