# Host List Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add drag-and-drop reordering, active session status indicators, per-host color tagging, and connection animation to the sidebar host list.

**Architecture:** New DB columns (`sort_order`, `color`) via migration 005. `@dnd-kit` for drag-and-drop. Active session tracking derived from existing session lifecycle in App.tsx. CSS-only spinner animation for connection state. Color rendered as left border accent.

**Tech Stack:** React, @dnd-kit/core + @dnd-kit/sortable, Tailwind CSS, Zod, better-sqlite3, Vitest

---

## Task 1: Install @dnd-kit dependencies

**Files:**
- Modify: `apps/ui/package.json`

**Step 1: Install packages**

Run:
```bash
pnpm --filter @hypershell/ui add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Verify installation**

Run: `pnpm --filter @hypershell/ui exec -- node -e "require('@dnd-kit/core')"`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/ui/package.json pnpm-lock.yaml
git commit -m "chore: add @dnd-kit dependencies for host list drag-and-drop"
```

---

## Task 2: Database migration — add sort_order and color columns

**Files:**
- Create: `packages/db/src/migrations/005_host_enhancements.sql`
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts:46-75` (add migration 005 execution)

**Step 1: Create migration SQL file**

```sql
-- 005_host_enhancements.sql
-- Adds sort_order for drag-and-drop reordering and color for visual tagging

ALTER TABLE hosts ADD COLUMN sort_order INTEGER;
ALTER TABLE host_groups ADD COLUMN sort_order INTEGER;
ALTER TABLE hosts ADD COLUMN color TEXT;
```

**Step 2: Add migration execution in hostsIpc.ts**

In `getOrCreateDatabase()`, after the migration 004 block (line ~74), add:

```typescript
// Migration 005: add sort_order and color columns
for (const stmt of [
  "ALTER TABLE hosts ADD COLUMN sort_order INTEGER",
  "ALTER TABLE host_groups ADD COLUMN sort_order INTEGER",
  "ALTER TABLE hosts ADD COLUMN color TEXT"
]) {
  try { db.exec(stmt); } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists") || msg.includes("duplicate column")) {
      console.info(`[hypershell] Migration 005: column already exists`);
    } else {
      console.error(`[hypershell] Migration 005 failed:`, msg);
    }
  }
}
```

**Step 3: Commit**

```bash
git add packages/db/src/migrations/005_host_enhancements.sql apps/desktop/src/main/ipc/hostsIpc.ts
git commit -m "feat(db): add sort_order and color columns to hosts table (migration 005)"
```

---

## Task 3: Update repository and types for sort_order + color

**Files:**
- Modify: `packages/db/src/repositories/hostsRepository.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `apps/ui/src/features/hosts/HostsView.tsx:9-13` (HostRecord type)
- Modify: `apps/ui/src/features/hosts/HostForm.tsx:36-47` (HostFormValue type)

**Step 1: Update DB repository types and queries**

In `packages/db/src/repositories/hostsRepository.ts`:

Add `sortOrder` and `color` to `HostRecord`:
```typescript
export type HostRecord = {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string | null;
  identityFile: string | null;
  authProfileId: string | null;
  groupId: string | null;
  notes: string | null;
  authMethod: string;
  agentKind: string;
  opReference: string | null;
  isFavorite: boolean;
  sortOrder: number | null;
  color: string | null;
};
```

Add to `HostInput`:
```typescript
sortOrder?: number | null;
color?: string | null;
```

Add to `HostRow`:
```typescript
sort_order: number | null;
color: string | null;
```

Update `mapRow`:
```typescript
sortOrder: row.sort_order ?? null,
color: row.color ?? null,
```

Update SQL `insertHost` — add `sort_order, color` to both column list and VALUES, and to ON CONFLICT SET.

Update SQL `listHosts` — add `sort_order, color` to SELECT, change ORDER BY to:
```sql
ORDER BY COALESCE(sort_order, 999999) ASC, is_favorite DESC, name COLLATE NOCASE ASC
```

Update `getHostById` SELECT to include `sort_order, color`.

Add `normalized.sortOrder` and `normalized.color` to `create()`.

Add new method `updateSortOrders`:
```typescript
const updateSortOrder = db.prepare(`
  UPDATE hosts SET sort_order = @sortOrder, group_id = @groupId, updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

// In the returned object:
updateSortOrders(items: Array<{ id: string; sortOrder: number; groupId: string | null }>): void {
  const tx = db.transaction(() => {
    for (const item of items) {
      updateSortOrder.run({ id: item.id, sortOrder: item.sortOrder, groupId: item.groupId });
    }
  });
  tx();
},
```

Also update `createInMemoryHostsRepository` similarly — add `sortOrder`, `color` defaults and `updateSortOrders` method.

**Step 2: Update shared IPC schemas**

In `packages/shared/src/ipc/schemas.ts`:

Add to `upsertHostRequestSchema`:
```typescript
sortOrder: z.number().int().nullable().optional(),
color: z.string().nullable().optional(),
```

Add to `hostRecordSchema`:
```typescript
sortOrder: z.number().int().nullable().optional(),
color: z.string().nullable().optional(),
```

Add new schema:
```typescript
export const reorderHostsRequestSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.number().int(),
    groupId: z.string().nullable()
  }))
});
export type ReorderHostsRequest = z.infer<typeof reorderHostsRequestSchema>;
```

**Step 3: Add IPC channel**

In `packages/shared/src/ipc/channels.ts`, add to `hostChannels`:
```typescript
reorder: "hosts:reorder",
```

**Step 4: Update UI types**

In `apps/ui/src/features/hosts/HostsView.tsx`, update `HostRecord`:
```typescript
export type HostRecord = HostFormValue & {
  id: string;
  notes?: string;
  isFavorite?: boolean;
  sortOrder?: number | null;
  color?: string | null;
};
```

In `apps/ui/src/features/hosts/HostForm.tsx`, add `color` to `HostFormValue`:
```typescript
export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  identityFile: string;
  group: string;
  tags: string;
  authMethod: "default" | "password" | "keyfile" | "agent" | "op-reference";
  agentKind: "system" | "pageant" | "1password";
  opReference: string;
  color?: string | null;
};
```

**Step 5: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (types are backward-compatible with optional fields)

**Step 6: Commit**

```bash
git add packages/db/ packages/shared/ apps/ui/src/features/hosts/
git commit -m "feat: add sortOrder and color to host types, repository, and IPC schemas"
```

---

## Task 4: Wire up reorder IPC handler in desktop

**Files:**
- Modify: `apps/desktop/src/main/ipc/hostsIpc.ts`
- Modify: `apps/desktop/src/preload/` (preload bridge — add reorderHosts method)

**Step 1: Add reorder handler in hostsIpc.ts**

Import `reorderHostsRequestSchema` from shared. Add to `registerHostIpc`:

```typescript
ipcMain.handle(ipcChannels.hosts.reorder, (_event: IpcMainInvokeEvent, request: ReorderHostsRequest) => {
  const parsed = reorderHostsRequestSchema.parse(request);
  const repo = getOrCreateHostsRepo();
  if ('updateSortOrders' in repo) {
    (repo as any).updateSortOrders(parsed.items);
  }
  return { success: true };
});
```

Update `hostChannelList` to include `ipcChannels.hosts.reorder`.

Also update the upsert handler to pass through `color` and `sortOrder`:
```typescript
color: parsed.color ?? null,
sortOrder: parsed.sortOrder ?? null,
```

**Step 2: Add to preload bridge**

Find the preload file that exposes `window.hypershell` API. Add:
```typescript
reorderHosts: (request) => ipcRenderer.invoke(ipcChannels.hosts.reorder, request),
```

**Step 3: Update App.tsx loadHosts to include color and sortOrder**

In `apps/ui/src/app/App.tsx`, update `loadHosts` mapping (line ~34):
```typescript
sortOrder: h.sortOrder != null ? Number(h.sortOrder) : null,
color: h.color ? String(h.color) : null,
```

And `persistHost` (line ~78) to pass through:
```typescript
color: host.color ?? null,
sortOrder: host.sortOrder ?? null,
```

**Step 4: Commit**

```bash
git add apps/desktop/ apps/ui/src/app/App.tsx
git commit -m "feat: wire up reorder and color IPC handlers through preload bridge"
```

---

## Task 5: Connection animation CSS

**Files:**
- Modify: `apps/ui/src/index.css`

**Step 1: Add keyframes and color tag utilities**

Append to `apps/ui/src/index.css`:

```css
/* Host connection spinner */
@keyframes host-connecting-spin {
  to { transform: rotate(360deg); }
}

.host-status-connecting {
  width: 10px;
  height: 10px;
  border: 1.5px solid transparent;
  border-top-color: var(--color-accent);
  border-right-color: var(--color-accent);
  border-radius: 50%;
  animation: host-connecting-spin 0.8s linear infinite;
  background: none;
}

/* Host color tag left borders */
.host-color-red    { border-left-color: #f87171 !important; }
.host-color-orange { border-left-color: #fb923c !important; }
.host-color-yellow { border-left-color: #fbbf24 !important; }
.host-color-green  { border-left-color: #34d399 !important; }
.host-color-blue   { border-left-color: #60a5fa !important; }
.host-color-cyan   { border-left-color: #22d3ee !important; }
.host-color-purple { border-left-color: #a78bfa !important; }
.host-color-pink   { border-left-color: #f472b6 !important; }

/* Color swatch circles for context menu */
.color-swatch { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.color-swatch-red    { background: #f87171; }
.color-swatch-orange { background: #fb923c; }
.color-swatch-yellow { background: #fbbf24; }
.color-swatch-green  { background: #34d399; }
.color-swatch-blue   { background: #60a5fa; }
.color-swatch-cyan   { background: #22d3ee; }
.color-swatch-purple { background: #a78bfa; }
.color-swatch-pink   { background: #f472b6; }
```

**Step 2: Commit**

```bash
git add apps/ui/src/index.css
git commit -m "feat: add CSS for connection spinner animation and host color tags"
```

---

## Task 6: Active session tracking in App.tsx

**Files:**
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Add connecting and active host tracking state**

Add state after the existing state declarations (~line 134):

```typescript
const [connectingHostIds, setConnectingHostIds] = useState<Set<string>>(new Set());
```

Derive `activeSessionHostIds` from existing `tabs`:
```typescript
const activeSessionHostIds = useMemo(() => {
  const ids = new Set<string>();
  for (const tab of tabs) {
    // Extract host ID from session IDs like "ssh-{hostId}-{timestamp}"
    const match = tab.sessionId.match(/^ssh-(.+)-\d+$/);
    if (match) ids.add(match[1]);
    if (tab.hostId) ids.add(tab.hostId);
  }
  return ids;
}, [tabs]);
```

**Step 2: Update connectHost to set connecting state**

Wrap `connectHost` to track connecting state:

```typescript
const connectHost = useCallback(
  (host: HostRecord) => {
    setConnectingHostIds((prev) => new Set(prev).add(host.id));
    const optimisticSessionId = `ssh-${host.id}-${Date.now()}`;
    const destination = host.username
      ? `${host.username}@${host.hostname}`
      : host.hostname;
    openTab({
      tabKey: optimisticSessionId,
      sessionId: optimisticSessionId,
      title: host.name,
      transport: "ssh",
      profileId: destination,
      hostId: host.id,
      preopened: false
    });
  },
  [openTab]
);
```

Clear connecting state when host appears in active sessions:
```typescript
useEffect(() => {
  setConnectingHostIds((prev) => {
    const next = new Set(prev);
    let changed = false;
    for (const id of prev) {
      if (activeSessionHostIds.has(id)) {
        next.delete(id);
        changed = true;
      }
    }
    return changed ? next : prev;
  });
}, [activeSessionHostIds]);
```

**Step 3: Pass down to Sidebar**

Add to `SidebarProps` and plumb through:
```typescript
activeSessionHostIds: Set<string>;
connectingHostIds: Set<string>;
```

Then pass to `<SidebarHostList>`:
```typescript
activeSessionHostIds={activeSessionHostIds}
connectingHostIds={connectingHostIds}
```

**Step 4: Commit**

```bash
git add apps/ui/src/app/App.tsx apps/ui/src/features/sidebar/Sidebar.tsx
git commit -m "feat: track active and connecting session host IDs for status indicators"
```

---

## Task 7: Rewrite SidebarHostList with drag-and-drop, status, color, and animation

**Files:**
- Modify: `apps/ui/src/features/sidebar/SidebarHostList.tsx`

This is the main UI task. The component needs:
- `@dnd-kit` sortable for hosts within/between groups and group reordering
- Status dot reflecting `idle` / `connecting` / `connected`
- Color left border from `host.color`
- Color submenu in context menu

**Step 1: Update component props**

```typescript
export interface SidebarHostListProps {
  hosts: HostRecord[];
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
  onDuplicate: (host: HostRecord) => void;
  onDelete: (host: HostRecord) => void;
  onToggleFavorite: (host: HostRecord) => void;
  onCopyHostname: (host: HostRecord) => void;
  onCopyAddress: (host: HostRecord) => void;
  onSetColor: (host: HostRecord, color: string | null) => void;
  onReorder: (items: Array<{ id: string; sortOrder: number; group: string }>) => void;
}
```

**Step 2: Implement drag-and-drop with @dnd-kit**

Use `DndContext`, `SortableContext`, `useSortable` from @dnd-kit. Structure:

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

Create a `SortableHostItem` component that wraps each host button with `useSortable({ id: host.id })`. Apply `transform` and `transition` from sortable to the item style.

The `DndContext` `onDragEnd` handler should:
1. Determine the new order of items
2. Call `onReorder` with the updated `sortOrder` and `group` values

**Step 3: Status dot rendering**

Replace the current hover-only dot logic with:

```tsx
function StatusDot({ hostId, activeSessionHostIds, connectingHostIds }: {
  hostId: string;
  activeSessionHostIds: Set<string>;
  connectingHostIds: Set<string>;
}) {
  if (connectingHostIds.has(hostId)) {
    return <span className="host-status-connecting" />;
  }
  if (activeSessionHostIds.has(hostId)) {
    return (
      <span className="relative flex shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="absolute inset-0 h-2 w-2 rounded-full bg-success/30 blur-[3px]" />
      </span>
    );
  }
  return (
    <span className="relative flex shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-text-muted/40" />
    </span>
  );
}
```

**Step 4: Color left border**

On each host button, apply the color class:

```tsx
className={`relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 ${
  host.color ? `host-color-${host.color}` : "border-transparent hover:border-accent/50"
} px-2 py-1.5 text-left text-sm transition-all duration-150 hover:bg-base-700/60`}
```

**Step 5: Color submenu in context menu**

Add a "Set Color" section to `buildContextMenuActions`:

```typescript
const HOST_COLORS = ["red", "orange", "yellow", "green", "blue", "cyan", "purple", "pink"] as const;

// After the "Duplicate" action:
{ label: "", action: () => {}, separator: true },
...HOST_COLORS.map((color) => ({
  label: color.charAt(0).toUpperCase() + color.slice(1),
  action: () => onSetColor(host, color),
  icon: <span className={`color-swatch color-swatch-${color}`} />,
})),
{
  label: "Clear Color",
  action: () => onSetColor(host, null),
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
},
```

**Step 6: Run the app visually**

Run: `pnpm dev` (or however the app starts)
Verify: Hosts display with status dots, color borders, drag handles, and connection animations

**Step 7: Commit**

```bash
git add apps/ui/src/features/sidebar/SidebarHostList.tsx
git commit -m "feat: implement drag-and-drop, status indicators, color tags, and connection animation in host list"
```

---

## Task 8: Wire color and reorder callbacks in App.tsx

**Files:**
- Modify: `apps/ui/src/app/App.tsx`
- Modify: `apps/ui/src/features/sidebar/Sidebar.tsx`

**Step 1: Add onSetColor callback**

```typescript
const setHostColor = useCallback((host: HostRecord, color: string | null) => {
  const updated = { ...host, color };
  setHosts((prev) => prev.map((h) => (h.id === host.id ? updated : h)));
  void persistHost(updated);
}, []);
```

**Step 2: Add onReorder callback**

```typescript
const reorderHosts = useCallback((items: Array<{ id: string; sortOrder: number; group: string }>) => {
  setHosts((prev) => {
    const updated = [...prev];
    for (const item of items) {
      const idx = updated.findIndex((h) => h.id === item.id);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], sortOrder: item.sortOrder, group: item.group };
      }
    }
    return updated.sort((a, b) =>
      (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)
    );
  });
  void window.hypershell?.reorderHosts?.({ items: items.map((i) => ({ id: i.id, sortOrder: i.sortOrder, groupId: null })) });
}, []);
```

**Step 3: Thread through Sidebar props**

Add `onSetColor` and `onReorder` to `SidebarProps`, pass through to `SidebarHostList`.

**Step 4: Commit**

```bash
git add apps/ui/src/app/App.tsx apps/ui/src/features/sidebar/Sidebar.tsx
git commit -m "feat: wire color and reorder host callbacks through App and Sidebar"
```

---

## Task 9: Build and lint check

**Step 1: Build all workspaces**

Run: `pnpm build`
Expected: Clean build, no TypeScript errors

**Step 2: Lint**

Run: `pnpm lint`
Expected: No lint errors (fix any that appear)

**Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests pass

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build/lint issues from host list enhancements"
```

---

## Task 10: Manual verification and polish

**Step 1: Test drag-and-drop**

- Drag a host within a group → verify reorder persists on reload
- Drag a host to a different group → verify group changes
- Drag a group header → verify group order changes

**Step 2: Test status indicators**

- Click a host → verify spinner appears on status dot
- Wait for connection → verify dot turns solid green with glow
- Close the tab → verify dot returns to gray

**Step 3: Test color tagging**

- Right-click host → verify "Set Color" options appear with 8 color swatches
- Select a color → verify left border changes immediately
- Reload → verify color persists
- Select "Clear Color" → verify border returns to default

**Step 4: Test connection animation**

- Click connect → verify smooth transition: gray → spinner → green
- Force a failed connection → verify dot reverts to gray

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: host list enhancements — drag-and-drop, status indicators, color tags, connection animation"
```
