# UI Polish: Hosts List + App-Wide Design Pass

**Date:** 2026-08-03
**Status:** Approved design, pending implementation plan

## Goal

Give HyperShell a coherent, polished visual layer without changing its identity.
The four pains being addressed, in the user's words: visual dated/flat look,
cluttered sidebar, lacking micro-interactions, inconsistency across the app.

Root cause of the inconsistency: there are no shared UI primitives — every
button, input, select, and card hand-rolls its own Tailwind class string. The
semantic token system in `apps/ui/src/index.css` is good (multi-theme, semantic
names); what's missing is an elevation/motion/focus system on top of it and
components that consume it consistently.

## Constraints

- **Keep HyperShell's identity** — same palette, same dark-terminal character.
  No redesign, no new visual language.
- **All color flows through the existing semantic tokens** so every theme
  (default dark, default-light, Mocha, Nord, and any future ones) inherits the
  polish automatically. Hardcoded Tailwind palette colors (`bg-green-400`,
  `bg-red-600`, `text-cyan-400`) are bugs to be fixed, not styles to preserve.
- **Small UX changes allowed** (relocating clutter, hierarchy rework) as long
  as no feature is lost. No feature work beyond that.
- **No new dependencies.** Primitives are thin Tailwind wrappers; framer-motion
  (already installed) covers animation needs.
- Existing behavior-critical code (focus traps, drag-and-drop, keyboard
  shortcuts, IPC calls) must not regress.

## Section 1: Foundations

### Token additions (`apps/ui/src/index.css` `@theme` / `:root`)

- **Elevation** — three levels expressed as shadow + border combos:
  - `flat` — resting cards/rows (current look, formalized)
  - `raised` — popovers, dropdowns, tooltips, drag overlays
  - `overlay` — modals
  Dark themes render depth as shadow + a subtle top-edge inset highlight
  (`inset 0 1px 0 rgba(255,255,255,0.03)`); light theme uses real soft shadows.
- **Motion** — one vocabulary: `--motion-fast: 120ms` (hover/press),
  `--motion-base: 180ms` (reveal/collapse), `--motion-slow: 260ms` (modals),
  one standard ease `cubic-bezier(0.2, 0, 0, 1)`. Replaces ad-hoc
  `duration-150` / `0.15` values across the app.
- **Focus** — a single visible focus-ring recipe (`ring-2` accent at ~40%
  opacity + offset) applied via the primitives. Fixes the current a11y hole
  where several controls use `focus:outline-none` with no replacement.

### Primitives (`apps/ui/src/components/ui/`)

Plain Tailwind wrapper components, zero new deps:

| Primitive | Variants | Replaces |
|---|---|---|
| `Button` | `primary`, `ghost`, `outline`, `danger`; sizes `sm`/`md` | ~6 hand-rolled button styles |
| `IconButton` | `ghost`, `accent` | sidebar +/gear/filter buttons, tab "+", modal "×" |
| `Input` | single style, optional leading icon | filter input, form fields |
| `Select` | matches Input | export dropdown, form selects |
| `SectionLabel` | uppercase micro-label | group headers, section titles |
| `Kbd` | keyboard hint chip | Ctrl+K chips |
| `EmptyState` | icon + one line + action(s) | ad-hoc empty-state markup |

The `Input`/`Select` styling is promoted from `SettingsPanel.tsx`'s existing
`inputClasses` recipe — the best field styling already in the app.

Existing `Modal.tsx`, `ContextMenu.tsx`, `ConfirmDialog.tsx`, `PromptDialog.tsx`
are restyled to consume the same tokens — not rewritten.

## Section 2: Sidebar + Hosts List

### Declutter

- **Export controls leave the sidebar.** The always-visible format `<select>` +
  Export button in `SidebarHostList.tsx` become an overflow **"⋯" menu** on the
  Hosts section header (next to the existing "+"), with items: Export as JSON /
  CSV / SSH Config, plus Import SSH Config. Same functionality, zero standing
  clutter.
- **Tag chips collapse behind the filter.** The tag-chip row renders only while
  the filter is open (magnifier toggled) — text and tag filtering become one
  "filter mode". Closing the filter clears tag selections along with the query.
- Quick Connect bar stays as-is at the top.

### Host rows

- Keep the current anatomy (status dot, mono name + favorite star,
  `user@host:port` subline, color left-border); refine: tighter vertical
  rhythm, hover/selected states from the new tokens, cleaned-up color-border
  rendering.
- **Hover-reveal quick action:** an SFTP icon button fades in at the row's
  right edge on hover. Connect stays the whole-row click.
- Group headers gain a **host count** (`PRODUCTION · 4`) and become
  **collapsible** (chevron; state persisted per group in localStorage).
  Favorites-first sort unchanged.
- Per-row gradient hairline dividers are removed — groups + spacing + hover
  states carry the structure.

### Empty states

- "No hosts yet" → `EmptyState`: icon, one line, **Add host** (primary) +
  **Import SSH config** (ghost).
- "No matching hosts" → shows the query and a one-click **Clear filter**.

### Micro-interactions

Drag overlay gets `raised` elevation; status-dot state transitions animate;
group collapse animates at `--motion-base`.

## Section 3: Tabs + Status Bar

### Tab bar (`TabBar.tsx`)

- **Theme-leak fix:** `tabStateColors` / `stateTextColors` hardcode Tailwind
  palette colors — switch to semantic tokens (`success`/`warning`/`danger`/
  `text-muted`).
- Connecting/reconnecting dots get the sidebar's pulse animation.
- Tab tooltip adopts `raised` elevation + fade-in at `--motion-fast`.
- Active tab keeps the accent top-line; inactive hover and close "×" use shared
  hover tokens; "+" becomes `IconButton`.
- Dragged tab: `raised` elevation + slight scale.

### Status bar (`StatusBar.tsx`)

- **Calm the rainbow:** all stat values become `text-text-secondary`, icons
  `text-text-muted`; the state dot stays the only always-colored element.
  Fixes hardcoded `text-cyan-400`.
- Latency color-shifts only when abnormal: `warning` above 150 ms, `danger`
  above 400 ms.
- Transport badge and session count use the shared micro-label style; stat
  clusters separated by thin separators with normalized spacing.

## Section 4: Dialogs & Modals

- **Modal shell (`Modal.tsx`):** behavior untouched (focus trap, Escape,
  backdrop-click). Restyle to `overlay` elevation + motion tokens. Two API
  additions: optional `footer` slot (standardized right-aligned action row) and
  `size` prop (`sm`/`md`/`lg`).
- **ConfirmDialog / PromptDialog:** consume `Button`; fix hardcoded
  `bg-red-600` → `danger` token. Auto-focus + Enter behavior preserved.
- **ContextMenu:** `raised` elevation, fade-in at `--motion-fast`, normalized
  paddings. (Shared by hosts, tabs, SFTP.)
- **Feature dialogs** (HostForm, quick connect, tmux picker, import dialogs,
  keyboard-interactive prompt, host-key verification):
  - Fields switch to `Input`/`Select` with one field anatomy: label above,
    control, optional help text below.
  - **HostForm** gets visual grouping into labeled sections (Connection, Auth,
    Advanced/Reconnect, Tags) via `SectionLabel` — same fields, same order,
    same logic; no structural rearchitecture.
  - Action rows move into the standardized Modal footer (primary right, ghost
    cancel beside it).

## Section 5: Settings + Welcome/Empty States

### Settings (`SettingsPanel.tsx`, `ThemeEditor.tsx`, `BackupRestorePanel.tsx`)

- Local `inputClasses` is promoted into the shared primitives (see Section 1);
  the panel then consumes `Input`/`Select` like every other surface.
- One **setting-row anatomy**: label + one-line description left, control
  right-aligned; rows grouped under `SectionLabel` headers.
- Category nav rail gets the sidebar's active-state treatment (accent
  indicator + hover tokens).
- No logic changes anywhere.

### Welcome screen

Light touch only: `<kbd>` chip → `Kbd`, local-profile pills → `Button`
(`outline`/pill styling), motion durations join the vocabulary. Animated logo
and background gradients untouched.

### Empty states elsewhere

Serial list, snippets, and similar views adopt the shared `EmptyState`
component (icon, one line, one action).

## Implementation Order

1. Foundations (tokens + primitives) — everything else depends on this
2. Sidebar + hosts list
3. Tabs + status bar
4. Dialogs & modals
5. Settings + welcome/empty states

Each phase leaves the app shippable; later phases only get cheaper because the
primitives exist.

## Testing

- Existing unit tests (Vitest) and Playwright browser E2E must stay green —
  notably `accessibility.spec.ts` (axe), which the focus-ring work should
  improve, not regress.
- New primitives get lightweight unit tests only where they carry logic
  (variant class mapping); no snapshot styling tests.
- Behavior-preserving refactors (export menu relocation, collapsible groups)
  verified via existing E2E flows plus manual pass across all four themes
  (default dark, light, Mocha, Nord).

## Out of Scope

- New features beyond the listed declutter/UX moves
- Terminal rendering, xterm theming, SFTP browser internals
- Any main-process / IPC changes
- New dependencies or component libraries
