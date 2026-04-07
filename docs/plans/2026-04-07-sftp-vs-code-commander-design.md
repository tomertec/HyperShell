# SFTP UI Overhaul: VS Code Commander

**Date:** 2026-04-07
**Approach:** Cohesive single pass — restyle, icons, keyboard, toolbar consolidation
**Backend changes:** None — all UI-layer work

---

## 1. Visual Density

Target ~24px row height (VS Code Explorer density).

- Row padding: `py-[2px] px-1.5`
- Font: 13px filenames, 11px metadata columns
- No row borders — alternating `even:bg-base-800/30` + `hover:bg-base-700/30`
- Selected row: `bg-accent/15` with 2px left accent border
- Column headers: sticky, 20px, `text-[10px]` uppercase, bottom border only
- Remove "Local Files" / "Remote Files" section header bars — pane headers already identify them

## 2. Monochrome Icon System

Single `FileIcon` component, inline SVGs, 14x14px, ~1.5px stroke.

| Icon | Extensions | Color |
|------|-----------|-------|
| `folder` | directories | `text-accent` |
| `file` | unknown/generic | `text-text-muted` |
| `file-code` | ts, js, py, go, rs, c, java, sh, yml, json, toml, xml, html, css | `text-text-muted` |
| `file-text` | md, txt, log, csv, ini, cfg, conf | `text-text-muted` |
| `file-image` | png, jpg, gif, svg, webp, ico, bmp | `text-text-muted` |
| `file-archive` | zip, tar, gz, 7z, rar, bz2, xz | `text-text-muted` |

Replaces current text badge system. Directories get `font-medium` on filename.

## 3. Toolbar Consolidation

Current: 3 bars per pane (toolbar, pane header, breadcrumb) = 6 total.
New: 1 global toolbar + 1 breadcrumb bar per pane = 3 total.

### Global toolbar (28px):
```
← → │ Bookmarks(3)  Refresh  Disconnect    [Ctrl+F filter]
```

### Breadcrumb bar per pane (24px):
- Local: drive selector + breadcrumb segments + `..` button
- Remote: `REMOTE` label + breadcrumb segments + `..` button
- Editable: `Ctrl+L` turns breadcrumb into text input, Enter confirms, Escape cancels

### Quick filter:
- Right side of global toolbar, hidden by default with `Ctrl+F` hint
- Expands to ~200px when active, shows match count "3 / 47"
- Filters active pane by substring, client-side instant
- Per-pane, resets on directory change
- Escape clears

## 4. Keyboard Navigation — Full Commander

### Focus model:
- `activePane: "local" | "remote"` in sftpStore
- Active pane: subtle `border-t-2 border-accent`
- Tab switches pane
- All shortcuts apply to active pane

### Cursor vs selection:
- Cursor = single highlighted row (moves with arrow keys)
- Selection = set of checked items (toggled with Space)
- No explicit selection → operations apply to cursor row

### Navigation keys:
| Key | Action |
|-----|--------|
| ↑ / k | Cursor up |
| ↓ / j | Cursor down |
| Enter | Open dir / edit file |
| Backspace | Go up directory |
| Home | First entry |
| End | Last entry |
| PageUp/Down | Jump 20 rows |
| Tab | Switch pane |
| Ctrl+A | Select all |
| Space | Toggle selection on cursor row |
| Shift+↑/↓ | Extend selection |

### Commander F-keys:
| Key | Action |
|-----|--------|
| F2 | Rename |
| F5 | Copy to opposite pane |
| F6 | Move (transfer + delete source, remote-only) |
| F7 | New folder |
| F8 / Delete | Delete (with confirm) |
| Ctrl+R | Refresh |
| Ctrl+F | Focus filter |
| Escape | Clear filter / selection |
| Ctrl+L | Focus breadcrumb (editable path) |

## 5. Store Changes

`sftpStore.ts` additions:
- `activePane: "local" | "remote"` — which pane has focus
- `localCursorIndex: number` — cursor position in local entries
- `remoteCursorIndex: number` — cursor position in remote entries
- `localFilterText: string` — filter for local pane
- `remoteFilterText: string` — filter for remote pane
- `setActivePane`, `setCursorIndex`, `setFilterText` actions

## 6. Files Modified

| File | Changes |
|------|---------|
| `FileList.tsx` | Row restyle, cursor highlight, keyboard handler, icon integration, remove section header |
| `FileIcon.tsx` | **New** — SVG icon component with extension mapping |
| `SftpToolbar.tsx` | Consolidate with filter input, compact layout |
| `LocalPane.tsx` | Inline breadcrumb in compact bar, remove separate header |
| `RemotePane.tsx` | Inline breadcrumb in compact bar, remove separate header |
| `SftpDualPane.tsx` | Active pane tracking, Tab handler, pane focus indicator |
| `PathBreadcrumb.tsx` | Add editable mode (Ctrl+L) |
| `sftpStore.ts` | Add activePane, cursor, filter state |
| `SftpTab.tsx` | Wire keyboard events, restructure toolbar |
| `fileUtils.ts` | Icon type mapping function |

## 7. Not In Scope

- Transfer history DB table
- Batch chmod UI
- File preview panel
- Symlink detection (needs backend `isSymlink`)
- Virtualized list (react-window)
- Multi-tab SFTP
- Hidden files toggle
