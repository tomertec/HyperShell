# Host List Enhancements Design

**Date:** 2026-04-07
**Status:** Approved

## Overview

Four enhancements to the sidebar host list: drag-and-drop reordering, active session status indicators, per-host color tagging, and connection animations.

## 1. Drag-and-Drop Reordering

- Add `sort_order INTEGER` column to `hosts` table (nullable, new migration `005_host_enhancements.sql`)
- Add `sort_order INTEGER` column to `host_groups` table
- Use `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (lightweight, accessible, React-native)
- Hosts draggable within and between groups; group headers also draggable
- Dragging a host to a different group updates its `group` field
- Visual feedback: semi-transparent drag overlay, insertion line indicator
- New IPC method `reorderHosts` to batch-persist sort orders
- Repository gets `updateSortOrder(id, sortOrder, groupId)` method

## 2. Active Session Status Indicator

- Track active session IDs in a set/map at the App level (already has session lifecycle events)
- Pass `activeSessionHostIds: Set<string>` down to `SidebarHostList`
- Status dot: **green + glow** when host has active session, **muted gray** otherwise (always visible)
- Derive from existing `connectHost` / session close events — no new IPC needed

## 3. Color Tagging

- Add `color TEXT` column to `hosts` table (nullable) in the same migration
- 8 preset colors: red, orange, yellow, green, blue, cyan, purple, pink
- Stored as color name string (e.g. `"red"`, `"cyan"`)
- Displayed as colored left border on the host item (replaces transparent/hover-only accent)
- Assigned via context menu > "Set Color" submenu with 8 swatches + "None" to clear
- Add `color` to `HostRecord`, `HostInput`, `HostFormValue` types, IPC schemas, and repository

## 4. Connection Animation

- On click-to-connect, status dot transitions to a spinning ring animation (CSS `@keyframes`)
- State flow: `idle` (gray dot) → `connecting` (spinning ring, accent color) → `connected` (solid green + glow)
- `connecting` state set immediately on click, transitions to `connected` when session becomes active
- If connection fails, reverts to `idle`
- Pure CSS animation — no JS animation library needed

## Data Flow

```
Click host → set connecting state → connectHost() IPC
                                  → session events bubble up
                                  → activeSessionHostIds updated
                                  → dot settles to green
```

## Files Modified

| Layer | Files |
|-------|-------|
| DB | New migration `005_host_enhancements.sql`, `hostsRepository.ts` |
| Shared | IPC schemas for new fields + `reorderHosts` channel |
| Desktop | `hostsIpc.ts` — new handler |
| UI | `SidebarHostList.tsx` (main changes), `HostsView.tsx` (type), `HostForm.tsx` (color field), `App.tsx` (active sessions tracking, connecting state), `index.css` (spinner keyframes, color mappings) |

## Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — added to `apps/ui`

## Decisions

- **Status indicator:** Shows active session state only (no TCP ping) — zero network overhead
- **Drag scope:** Full reorder — hosts within/between groups + group header reorder
- **Color tagging:** Per-host via context menu, 8 preset colors, no custom color picker
- **Animation style:** Status dot → spinner → solid green, pure CSS
