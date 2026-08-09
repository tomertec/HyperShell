# Tab Title Colors — Design

**Date:** 2026-08-09
**Status:** Approved

## Goal

Let users distinguish terminal tabs by assigning a color to a displayed tab
title. A choice made once for `Claude`, for example, is automatically reused by
every current and future tab whose displayed title is `Claude`.

## Interaction

- Right-clicking a terminal tab opens a small **Tab color** menu.
- The menu offers a fixed, theme-safe palette: orange, blue, green, purple, red,
  yellow, and pink.
- Yellow uses a dedicated, higher-saturation tab color so it remains visibly
  distinct from orange; light themes use a darker yellow for text contrast.
- A **Default** option removes the saved rule for that title.
- Color choices are named and keyboard reachable; swatches are not the only
  indication of color.

## Matching and precedence

The rule key is the tab's currently displayed title, using the same
`processTitle ?? dynamicTitle ?? title` resolution already used by the tab bar.
Keys are trimmed and compared case-insensitively, so `Claude` and `claude`
share one rule.

When a dynamic or process title changes, the tab immediately resolves the rule
for its new visible title. Selecting a color updates every currently open tab
with the same normalized visible title.

## Presentation

The assigned color applies to the tab icon, title text, and the active tab's
top indicator line. The connection-status dot retains its independent state
color. Unassigned titles keep the existing accent indicator, theme colors, and
hover behavior.

## Persistence

Title-to-color rules are stored with HyperShell's existing application settings
and loaded through `settingsStore`. The persisted value is a map from normalized
title to a palette identifier, rather than arbitrary CSS or hex input. Unknown
or invalid identifiers are ignored by schema/default handling.

## Components and data flow

1. `TabBar` resolves each tab's visible title.
2. A pure helper normalizes that title and looks up its palette identifier.
3. Right-clicking a tab opens a palette menu anchored at the pointer.
4. Selecting a palette entry updates the settings store and persists the full
   rule map through the existing settings bridge.
5. Every matching tab re-renders with the selected semantic color.

The context menu closes after selection, on outside click, or with Escape.

## Testing

- Unit-test title normalization, case-insensitive matching, valid palette
  resolution, and clearing a rule.
- Component-test the tab menu, persistence callback, matching-tab updates, and
  Default behavior.
- Run the focused UI unit tests, UI build/type-check, and relevant browser E2E
  coverage. Existing terminal-rendering work remains out of scope.

