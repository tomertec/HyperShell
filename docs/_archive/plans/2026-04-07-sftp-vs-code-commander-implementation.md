# SFTP VS Code Commander — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the SFTP dual-pane file browser into a VS Code Explorer–dense, keyboard-driven commander interface.

**Architecture:** All changes are UI-layer only (no IPC/backend changes). Extend the existing Zustand store with cursor/focus/filter state, replace the text badge icon system with inline SVGs, consolidate toolbar bars, and wire up a keyboard event handler on the `SftpDualPane` container.

**Tech Stack:** React 19, Zustand, Tailwind CSS, inline SVG icons, Vitest for tests.

**Design doc:** `docs/plans/2026-04-07-sftp-vs-code-commander-design.md`

---

### Task 1: Extend sftpStore with activePane, cursor, and filter state

**Files:**
- Modify: `apps/ui/src/features/sftp/sftpStore.ts`
- Modify: `apps/ui/src/features/sftp/sftpStore.test.ts`

**Step 1: Write failing tests**

Add to `sftpStore.test.ts`:

```typescript
it("initializes new cursor/focus/filter defaults", () => {
  const store = createSftpStore("sftp-1");
  const state = store.getState();

  expect(state.activePane).toBe("local");
  expect(state.localCursorIndex).toBe(0);
  expect(state.remoteCursorIndex).toBe(0);
  expect(state.localFilterText).toBe("");
  expect(state.remoteFilterText).toBe("");
});

it("switches active pane", () => {
  const store = createSftpStore("sftp-1");
  store.getState().setActivePane("remote");
  expect(store.getState().activePane).toBe("remote");
});

it("sets cursor index", () => {
  const store = createSftpStore("sftp-1");
  store.getState().setCursorIndex("local", 5);
  expect(store.getState().localCursorIndex).toBe(5);
  store.getState().setCursorIndex("remote", 3);
  expect(store.getState().remoteCursorIndex).toBe(3);
});

it("sets filter text", () => {
  const store = createSftpStore("sftp-1");
  store.getState().setFilterText("local", "src");
  expect(store.getState().localFilterText).toBe("src");
  store.getState().setFilterText("remote", "conf");
  expect(store.getState().remoteFilterText).toBe("conf");
});

it("resets cursor when path changes", () => {
  const store = createSftpStore("sftp-1");
  store.getState().setCursorIndex("local", 5);
  store.getState().setLocalPath("C:\\NewDir");
  expect(store.getState().localCursorIndex).toBe(0);
});

it("resets filter when path changes", () => {
  const store = createSftpStore("sftp-1");
  store.getState().setFilterText("remote", "test");
  store.getState().setRemotePath("/new/path");
  expect(store.getState().remoteFilterText).toBe("");
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- --run sftpStore`
Expected: FAIL — properties and methods not found

**Step 3: Implement store additions**

In `sftpStore.ts`, add to the `SftpStoreState` interface:

```typescript
activePane: SftpPane;
localCursorIndex: number;
remoteCursorIndex: number;
localFilterText: string;
remoteFilterText: string;
setActivePane: (pane: SftpPane) => void;
setCursorIndex: (pane: SftpPane, index: number) => void;
setFilterText: (pane: SftpPane, text: string) => void;
```

Add to `createSftpStore` initial state:

```typescript
activePane: "local" as SftpPane,
localCursorIndex: 0,
remoteCursorIndex: 0,
localFilterText: "",
remoteFilterText: "",
```

Add action implementations:

```typescript
setActivePane: (pane) => set({ activePane: pane }),

setCursorIndex: (pane, index) =>
  set(pane === "local" ? { localCursorIndex: index } : { remoteCursorIndex: index }),

setFilterText: (pane, text) =>
  set(pane === "local" ? { localFilterText: text } : { remoteFilterText: text }),
```

Modify `setLocalPath` to also reset `localCursorIndex: 0` and `localFilterText: ""` in its return object.

Modify `setRemotePath` to also reset `remoteCursorIndex: 0` and `remoteFilterText: ""` in its return object.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- --run sftpStore`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/sftpStore.ts apps/ui/src/features/sftp/sftpStore.test.ts
git commit -m "feat(sftp): add activePane, cursor, and filter state to sftpStore"
```

---

### Task 2: Create FileIcon component with inline SVGs

**Files:**
- Create: `apps/ui/src/features/sftp/components/FileIcon.tsx`

**Step 1: Update icon type mapping in fileUtils**

In `apps/ui/src/features/sftp/utils/fileUtils.ts`, update `FILE_ICON_MAP` to consolidate icon types to our 6 variants. Replace the existing map:

```typescript
const FILE_ICON_MAP: Record<string, string> = {
  ts: "file-code",
  tsx: "file-code",
  js: "file-code",
  jsx: "file-code",
  json: "file-code",
  yaml: "file-text",
  yml: "file-text",
  toml: "file-code",
  xml: "file-code",
  html: "file-code",
  css: "file-code",
  md: "file-text",
  txt: "file-text",
  log: "file-text",
  csv: "file-text",
  ini: "file-text",
  cfg: "file-text",
  conf: "file-text",
  png: "file-image",
  jpg: "file-image",
  jpeg: "file-image",
  gif: "file-image",
  svg: "file-image",
  webp: "file-image",
  ico: "file-image",
  bmp: "file-image",
  zip: "file-archive",
  tar: "file-archive",
  gz: "file-archive",
  "7z": "file-archive",
  rar: "file-archive",
  bz2: "file-archive",
  xz: "file-archive",
  py: "file-code",
  go: "file-code",
  rs: "file-code",
  c: "file-code",
  cpp: "file-code",
  h: "file-code",
  java: "file-code",
  sh: "file-code",
  bash: "file-code",
  zsh: "file-code",
  rb: "file-code",
  php: "file-code",
  sql: "file-code",
  r: "file-code",
  lua: "file-code",
  pdf: "file-text"
};
```

**Step 2: Create FileIcon component**

Create `apps/ui/src/features/sftp/components/FileIcon.tsx`:

```tsx
import { getFileIcon } from "../utils/fileUtils";

export type FileIconType = "folder" | "file" | "file-code" | "file-text" | "file-image" | "file-archive";

const iconPaths: Record<FileIconType, string> = {
  folder:
    "M2 4a1 1 0 0 1 1-1h3.93a1 1 0 0 1 .83.45L9 5h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z",
  file:
    "M4 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6l-4-4H4z",
  "file-code":
    "M4 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6l-4-4H4zM6 9l-1.5 1.5L6 12M10 9l1.5 1.5L10 12M8 9l-1 4",
  "file-text":
    "M4 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6l-4-4H4zM5 8h6M5 10.5h4",
  "file-image":
    "M4 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6l-4-4H4zM5 12l2-3 1.5 1.5L11 8",
  "file-archive":
    "M4 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6l-4-4H4zM7 4h2M7 6h2M7 8h2M7 10h2"
};

export interface FileIconProps {
  name: string;
  isDirectory: boolean;
  className?: string;
}

export function FileIcon({ name, isDirectory, className }: FileIconProps) {
  const iconKey = getFileIcon(name, isDirectory) as FileIconType;
  const pathData = iconPaths[iconKey] ?? iconPaths.file;
  const colorClass = isDirectory ? "text-accent" : "text-text-muted";

  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${colorClass} ${className ?? ""}`}
    >
      <path d={pathData} />
    </svg>
  );
}
```

**Step 3: Run full tests to verify nothing breaks**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/FileIcon.tsx apps/ui/src/features/sftp/utils/fileUtils.ts
git commit -m "feat(sftp): add monochrome FileIcon SVG component"
```

---

### Task 3: Restyle FileList to VS Code density

**Files:**
- Modify: `apps/ui/src/features/sftp/components/FileList.tsx`

This task restyles the file list rows to ~24px height, adds alternating row backgrounds, accent-border selection, integrates `FileIcon`, and removes the section header bar.

**Step 1: Implement the restyle**

Key changes to `FileList.tsx`:

1. Add import: `import { FileIcon } from "./FileIcon";`

2. Remove the section header `div` ("Local Files" / "Remote Files") entirely.

3. Replace the table row classes. Each `<tr>`:
```tsx
className={`transition-colors ${
  selection.has(entry.path)
    ? "bg-accent/15"
    : index % 2 === 0
      ? "hover:bg-base-700/30"
      : "bg-base-800/30 hover:bg-base-700/30"
} ${cursorIndex === index ? "ring-1 ring-inset ring-accent/40" : ""}`}
```
Note: `cursorIndex` is a new prop added in this step. Add it to `FileListProps`:
```typescript
cursorIndex: number;
```

4. Remove all `border-t border-border` from rows — no row borders.

5. Each `<td>` uses `px-1.5 py-[2px]` padding.

6. The name cell replaces the text badge with `FileIcon`:
```tsx
<td className="px-1.5 py-[2px]">
  <div className="flex min-w-0 items-center gap-1.5">
    <FileIcon name={entry.name} isDirectory={entry.isDirectory} />
    <span className={`truncate text-[13px] ${entry.isDirectory ? "font-medium text-text-primary" : "text-text-primary"}`}>
      {entry.name}
    </span>
  </div>
</td>
```

7. Metadata cells: `text-[11px]` for size, modified, permissions.

8. Column headers: `py-[3px] px-1.5 text-[10px]` — target 20px height.

9. The table itself: remove `text-sm`, use no base font size (each cell sets its own).

10. Remove the `getIconBadge` function entirely — no longer used.

11. Add `index` to the `.map()` callback: `sortedEntries.map((entry, index) => { ... })` — already available, just ensure it's used.

**Step 2: Update FileList callers to pass cursorIndex**

In `LocalPane.tsx`, pass `cursorIndex={localCursorIndex}` (read from store).
In `RemotePane.tsx`, pass `cursorIndex={remoteCursorIndex}` (read from store).

Add the store read in each pane:
```typescript
const cursorIndex = useStore(store, (state) => state.localCursorIndex); // or remoteCursorIndex
```

**Step 3: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/FileList.tsx apps/ui/src/features/sftp/components/LocalPane.tsx apps/ui/src/features/sftp/components/RemotePane.tsx
git commit -m "feat(sftp): restyle FileList to VS Code density with monochrome icons"
```

---

### Task 4: Consolidate toolbar and add quick filter

**Files:**
- Modify: `apps/ui/src/features/sftp/components/SftpToolbar.tsx`
- Modify: `apps/ui/src/features/sftp/SftpTab.tsx`

**Step 1: Add filter input to SftpToolbar**

Add new props to `SftpToolbarProps`:
```typescript
filterText: string;
onFilterChange: (text: string) => void;
filterMatchCount: number;
filterTotalCount: number;
filterInputRef: React.RefObject<HTMLInputElement | null>;
```

Add the filter input to the toolbar, right-aligned before Disconnect:
```tsx
<div className="flex items-center gap-1">
  <input
    ref={filterInputRef}
    type="text"
    value={filterText}
    onChange={(e) => onFilterChange(e.target.value)}
    placeholder="Filter (Ctrl+F)"
    className="w-0 rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-muted/50 outline-none transition-all focus:w-44 focus:border focus:border-accent/50 [&:not(:placeholder-shown)]:w-44 [&:not(:placeholder-shown)]:border [&:not(:placeholder-shown)]:border-accent/50"
  />
  {filterText && (
    <span className="text-[10px] text-text-muted">
      {filterMatchCount}/{filterTotalCount}
    </span>
  )}
</div>
```

**Step 2: Wire filter in SftpTab**

In `SftpTab.tsx`:
1. Read `activePane`, filter text, and entries from the store.
2. Compute `filterMatchCount` and `filterTotalCount` from the active pane's entries.
3. Create a `filterInputRef = useRef<HTMLInputElement>(null)`.
4. Pass all props to `SftpToolbar`.

**Step 3: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/SftpToolbar.tsx apps/ui/src/features/sftp/SftpTab.tsx
git commit -m "feat(sftp): add quick filter input to toolbar"
```

---

### Task 5: Consolidate pane headers — merge breadcrumb inline

**Files:**
- Modify: `apps/ui/src/features/sftp/components/LocalPane.tsx`
- Modify: `apps/ui/src/features/sftp/components/RemotePane.tsx`

**Step 1: Merge LocalPane header**

Replace the two separate bars (drive selector bar + PathBreadcrumb) with one combined bar:

```tsx
<div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
  <DriveSelector currentPath={localPath} onSelect={handleNavigate} />
  <button
    type="button"
    title="Go up"
    className="rounded p-0.5 text-[11px] text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
    onClick={() => handleNavigate(getParentPath(localPath))}
  >
    ..
  </button>
  <div className="mx-0.5 h-3 w-px bg-base-700" />
  <PathBreadcrumb path={localPath} onNavigate={handleNavigate} separator="\\" />
</div>
```

Remove the separate `<PathBreadcrumb>` call below the header — it's now inline.

**Step 2: Merge RemotePane header**

Same pattern — one bar combining REMOTE label, `..` button, and breadcrumb:

```tsx
<div className="flex items-center gap-1 border-b border-base-700 bg-base-900/80 px-1.5 py-[2px]">
  <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Remote</span>
  <button
    type="button"
    title="Go up"
    className="rounded p-0.5 text-[11px] text-text-secondary transition-colors hover:bg-base-700 hover:text-text-primary"
    onClick={() => handleNavigate(getParentPath(remotePath))}
  >
    ..
  </button>
  <div className="mx-0.5 h-3 w-px bg-base-700" />
  <PathBreadcrumb path={remotePath} onNavigate={handleNavigate} />
</div>
```

Remove separate `<PathBreadcrumb>` call.

**Step 3: Update PathBreadcrumb to render inline**

In `PathBreadcrumb.tsx`, change the outer `div` to render as an inline flex with `min-w-0 flex-1 overflow-hidden` so it truncates gracefully when the bar is narrow. Remove standalone padding — the parent bar controls padding now:

```tsx
<div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[11px] text-text-secondary">
```

**Step 4: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/components/LocalPane.tsx apps/ui/src/features/sftp/components/RemotePane.tsx apps/ui/src/features/sftp/components/PathBreadcrumb.tsx
git commit -m "feat(sftp): merge pane header and breadcrumb into single compact bar"
```

---

### Task 6: Add editable breadcrumb (Ctrl+L)

**Files:**
- Modify: `apps/ui/src/features/sftp/components/PathBreadcrumb.tsx`

**Step 1: Add editing state to PathBreadcrumb**

Add new optional props:
```typescript
editable?: boolean;
onPathSubmit?: (path: string) => void;
editingRef?: React.RefObject<HTMLInputElement | null>;
```

Add local state:
```typescript
const [isEditing, setIsEditing] = useState(false);
const [editValue, setEditValue] = useState(path);
const inputRef = editingRef ?? useRef<HTMLInputElement>(null);
```

When `isEditing` is true, render an input instead of breadcrumb segments:

```tsx
if (isEditing) {
  return (
    <div className="flex min-w-0 flex-1 items-center text-[11px]">
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onPathSubmit?.(editValue);
            setIsEditing(false);
          }
          if (e.key === "Escape") {
            setIsEditing(false);
            setEditValue(path);
          }
        }}
        onBlur={() => {
          setIsEditing(false);
          setEditValue(path);
        }}
        className="w-full rounded bg-base-800 px-1 py-0.5 text-text-primary outline-none ring-1 ring-accent/50"
        autoFocus
      />
    </div>
  );
}
```

Expose a way to trigger editing: when `editable` is true, double-clicking the breadcrumb enters edit mode. Also expose the `setIsEditing` via an imperative handle or simply watch for a `startEditing` prop.

Simpler approach: export a `startEditing` callback by making `PathBreadcrumb` accept an `onEditStart` and use a `useImperativeHandle` or just use the `editingRef` — when keyboard handler calls `editingRef.current?.focus()`, the component detects focus and enters edit mode.

Simplest approach: add a `forceEdit` boolean prop. When it transitions from false to true, enter edit mode. Parent controls it via state.

**Step 2: Wire Ctrl+L in the keyboard handler (Task 7 will handle the full wiring — this task just makes PathBreadcrumb support editing)**

**Step 3: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/PathBreadcrumb.tsx
git commit -m "feat(sftp): add editable mode to PathBreadcrumb"
```

---

### Task 7: Active pane focus indicator and Tab switching

**Files:**
- Modify: `apps/ui/src/features/sftp/components/SftpDualPane.tsx`
- Modify: `apps/ui/src/features/sftp/components/LocalPane.tsx`
- Modify: `apps/ui/src/features/sftp/components/RemotePane.tsx`

**Step 1: Add active pane indicator**

In `SftpDualPane.tsx`, read `activePane` from store and add `isActive` prop to each pane:

```typescript
const activePane = useStore(store, (state) => state.activePane);
const setActivePane = useStore(store, (state) => state.setActivePane);
```

Pass `isActive={activePane === "local"}` to `LocalPane` and `isActive={activePane === "remote"}` to `RemotePane`.

In each pane's root `div`, apply `border-t-2` conditionally:
```tsx
className={`flex h-full flex-col ${isActive ? "border-t-2 border-accent" : "border-t-2 border-transparent"}`}
```

Also set `onMouseDown={() => setActivePane("local")}` (or "remote") on each pane's root div so clicking a pane makes it active.

**Step 2: Add isActive and setActivePane props to pane interfaces**

In `LocalPaneProps`:
```typescript
isActive: boolean;
onActivate: () => void;
```

In `RemotePaneProps`:
```typescript
isActive: boolean;
onActivate: () => void;
```

**Step 3: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/SftpDualPane.tsx apps/ui/src/features/sftp/components/LocalPane.tsx apps/ui/src/features/sftp/components/RemotePane.tsx
git commit -m "feat(sftp): add active pane focus indicator with accent border"
```

---

### Task 8: Keyboard navigation handler

**Files:**
- Create: `apps/ui/src/features/sftp/hooks/useFileKeyboard.ts`
- Create: `apps/ui/src/features/sftp/hooks/useFileKeyboard.test.ts`
- Modify: `apps/ui/src/features/sftp/components/SftpDualPane.tsx`

This is the largest task — the full commander keyboard handler.

**Step 1: Write failing tests**

Create `apps/ui/src/features/sftp/hooks/useFileKeyboard.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { handleFileKeyDown, type FileKeyboardContext } from "./useFileKeyboard";

function makeContext(overrides: Partial<FileKeyboardContext> = {}): FileKeyboardContext {
  return {
    entries: [
      { name: "docs", path: "/docs", size: 0, modifiedAt: "", isDirectory: true },
      { name: "src", path: "/src", size: 0, modifiedAt: "", isDirectory: true },
      { name: "file.ts", path: "/file.ts", size: 100, modifiedAt: "", isDirectory: false },
      { name: "readme.md", path: "/readme.md", size: 50, modifiedAt: "", isDirectory: false }
    ],
    cursorIndex: 0,
    selection: new Set<string>(),
    setCursorIndex: vi.fn(),
    setSelection: vi.fn(),
    onNavigate: vi.fn(),
    onGoUp: vi.fn(),
    onEdit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onMkdir: vi.fn(),
    onTransfer: vi.fn(),
    onRefresh: vi.fn(),
    onFocusFilter: vi.fn(),
    onFocusBreadcrumb: vi.fn(),
    onSwitchPane: vi.fn(),
    onSelectAll: vi.fn(),
    ...overrides
  };
}

function fakeKey(key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true, ...mods });
}

describe("handleFileKeyDown", () => {
  it("moves cursor down with ArrowDown", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor down with j", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("j"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor up with ArrowUp", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    const handled = handleFileKeyDown(fakeKey("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor up with k", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    const handled = handleFileKeyDown(fakeKey("k"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("does not go below last entry", () => {
    const ctx = makeContext({ cursorIndex: 3 });
    const handled = handleFileKeyDown(fakeKey("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3);
  });

  it("does not go above first entry", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    const handled = handleFileKeyDown(fakeKey("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(0);
  });

  it("navigates into directory on Enter", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("Enter"), ctx);
    expect(ctx.onNavigate).toHaveBeenCalledWith("/docs");
  });

  it("edits file on Enter", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("Enter"), ctx);
    expect(ctx.onEdit).toHaveBeenCalledWith("/file.ts");
  });

  it("goes up on Backspace", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("Backspace"), ctx);
    expect(ctx.onGoUp).toHaveBeenCalled();
  });

  it("jumps to first on Home", () => {
    const ctx = makeContext({ cursorIndex: 3 });
    handleFileKeyDown(fakeKey("Home"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(0);
  });

  it("jumps to last on End", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("End"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3);
  });

  it("toggles selection on Space", () => {
    const ctx = makeContext({ cursorIndex: 1 });
    handleFileKeyDown(fakeKey(" "), ctx);
    expect(ctx.setSelection).toHaveBeenCalled();
    const newSelection = (ctx.setSelection as ReturnType<typeof vi.fn>).mock.calls[0][0] as Set<string>;
    expect(newSelection.has("/src")).toBe(true);
  });

  it("switches pane on Tab", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("Tab"), ctx);
    expect(ctx.onSwitchPane).toHaveBeenCalled();
  });

  it("renames on F2", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("F2"), ctx);
    expect(ctx.onRename).toHaveBeenCalledWith("/docs");
  });

  it("transfers on F5", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("F5"), ctx);
    expect(ctx.onTransfer).toHaveBeenCalled();
  });

  it("creates folder on F7", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("F7"), ctx);
    expect(ctx.onMkdir).toHaveBeenCalled();
  });

  it("deletes on F8", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("F8"), ctx);
    expect(ctx.onDelete).toHaveBeenCalled();
  });

  it("deletes on Delete key", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("Delete"), ctx);
    expect(ctx.onDelete).toHaveBeenCalled();
  });

  it("refreshes on Ctrl+R", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("r", { ctrlKey: true }), ctx);
    expect(ctx.onRefresh).toHaveBeenCalled();
  });

  it("focuses filter on Ctrl+F", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("f", { ctrlKey: true }), ctx);
    expect(ctx.onFocusFilter).toHaveBeenCalled();
  });

  it("focuses breadcrumb on Ctrl+L", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("l", { ctrlKey: true }), ctx);
    expect(ctx.onFocusBreadcrumb).toHaveBeenCalled();
  });

  it("selects all on Ctrl+A", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("a", { ctrlKey: true }), ctx);
    expect(ctx.onSelectAll).toHaveBeenCalled();
  });

  it("extends selection up with Shift+ArrowUp", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("ArrowUp", { shiftKey: true }), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
    expect(ctx.setSelection).toHaveBeenCalled();
  });

  it("jumps 20 rows on PageDown", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("PageDown"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3); // clamped to last entry
  });

  it("returns false for unhandled keys", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("x"), ctx);
    expect(handled).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- --run useFileKeyboard`
Expected: FAIL — module not found

**Step 3: Implement the keyboard handler**

Create `apps/ui/src/features/sftp/hooks/useFileKeyboard.ts`:

```typescript
export interface FileKeyboardEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileKeyboardContext {
  entries: FileKeyboardEntry[];
  cursorIndex: number;
  selection: Set<string>;
  setCursorIndex: (index: number) => void;
  setSelection: (selection: Set<string>) => void;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onEdit: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onTransfer: (paths: string[]) => void;
  onRefresh: () => void;
  onFocusFilter: () => void;
  onFocusBreadcrumb: () => void;
  onSwitchPane: () => void;
  onSelectAll: () => void;
}

const PAGE_SIZE = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getEffectivePaths(ctx: FileKeyboardContext): string[] {
  if (ctx.selection.size > 0) {
    return Array.from(ctx.selection);
  }
  const entry = ctx.entries[ctx.cursorIndex];
  return entry ? [entry.path] : [];
}

export function handleFileKeyDown(
  event: KeyboardEvent,
  ctx: FileKeyboardContext
): boolean {
  const { key, ctrlKey, metaKey, shiftKey } = event;
  const mod = ctrlKey || metaKey;
  const maxIndex = ctx.entries.length - 1;

  // Ctrl+ combos
  if (mod) {
    switch (key.toLowerCase()) {
      case "a":
        ctx.onSelectAll();
        return true;
      case "f":
        ctx.onFocusFilter();
        return true;
      case "r":
        ctx.onRefresh();
        return true;
      case "l":
        ctx.onFocusBreadcrumb();
        return true;
      default:
        return false;
    }
  }

  // Navigation with optional shift-extend
  if (key === "ArrowDown" || key === "j") {
    const next = clamp(ctx.cursorIndex + 1, 0, maxIndex);
    ctx.setCursorIndex(next);
    if (shiftKey) {
      const sel = new Set(ctx.selection);
      const entry = ctx.entries[next];
      if (entry) sel.add(entry.path);
      ctx.setSelection(sel);
    }
    return true;
  }

  if (key === "ArrowUp" || key === "k") {
    const next = clamp(ctx.cursorIndex - 1, 0, maxIndex);
    ctx.setCursorIndex(next);
    if (shiftKey) {
      const sel = new Set(ctx.selection);
      const entry = ctx.entries[next];
      if (entry) sel.add(entry.path);
      ctx.setSelection(sel);
    }
    return true;
  }

  switch (key) {
    case "Enter": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (!entry) return true;
      if (entry.isDirectory) {
        ctx.onNavigate(entry.path);
      } else {
        ctx.onEdit(entry.path);
      }
      return true;
    }

    case "Backspace":
      ctx.onGoUp();
      return true;

    case "Home":
      ctx.setCursorIndex(0);
      return true;

    case "End":
      ctx.setCursorIndex(maxIndex);
      return true;

    case "PageDown":
      ctx.setCursorIndex(clamp(ctx.cursorIndex + PAGE_SIZE, 0, maxIndex));
      return true;

    case "PageUp":
      ctx.setCursorIndex(clamp(ctx.cursorIndex - PAGE_SIZE, 0, maxIndex));
      return true;

    case " ": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (!entry) return true;
      const sel = new Set(ctx.selection);
      if (sel.has(entry.path)) {
        sel.delete(entry.path);
      } else {
        sel.add(entry.path);
      }
      ctx.setSelection(sel);
      return true;
    }

    case "Tab":
      ctx.onSwitchPane();
      return true;

    case "F2": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (entry) ctx.onRename(entry.path);
      return true;
    }

    case "F5": {
      ctx.onTransfer(getEffectivePaths(ctx));
      return true;
    }

    case "F6": {
      ctx.onTransfer(getEffectivePaths(ctx));
      return true;
    }

    case "F7":
      ctx.onMkdir();
      return true;

    case "F8":
    case "Delete":
      ctx.onDelete(getEffectivePaths(ctx));
      return true;

    case "Escape":
      ctx.setSelection(new Set());
      return true;

    default:
      return false;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- --run useFileKeyboard`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/hooks/useFileKeyboard.ts apps/ui/src/features/sftp/hooks/useFileKeyboard.test.ts
git commit -m "feat(sftp): add commander keyboard handler with vim keys and F-key bindings"
```

---

### Task 9: Wire keyboard handler into SftpDualPane

**Files:**
- Modify: `apps/ui/src/features/sftp/components/SftpDualPane.tsx`
- Modify: `apps/ui/src/features/sftp/SftpTab.tsx`

**Step 1: Add keyboard event listener to SftpDualPane**

In `SftpDualPane.tsx`:

1. Import `handleFileKeyDown` from the hooks.
2. Read active pane state, entries, cursor, selection from store.
3. Add a `tabIndex={0}` and `onKeyDown` handler to the container div.
4. Build the `FileKeyboardContext` from current active pane state and pass to `handleFileKeyDown`.
5. If handled, call `event.preventDefault()` and `event.stopPropagation()`.

Add new props to `SftpDualPaneProps` for the action callbacks that the keyboard handler needs:
```typescript
onRename: (path: string) => void;
onDelete: (paths: string[]) => void;
onMkdir: () => void;
onRefresh: () => void;
onFocusFilter: () => void;
filterInputRef: React.RefObject<HTMLInputElement | null>;
```

The `onEdit`, `onUpload`, `onDownload` are already passed. Wire `onTransfer` to call either `onUpload` or `onDownload` depending on active pane.

**Step 2: Pass new props from SftpTab**

In `SftpTab.tsx`, create `handleRefresh` callbacks and pass them along with `filterInputRef` to `SftpDualPane`.

**Step 3: Add auto-focus**

Add `useEffect` in `SftpDualPane` to auto-focus the container on mount so keyboard works immediately:
```typescript
useEffect(() => {
  containerRef.current?.focus();
}, []);
```

And add `outline-none` to the container to prevent focus ring.

**Step 4: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/components/SftpDualPane.tsx apps/ui/src/features/sftp/SftpTab.tsx
git commit -m "feat(sftp): wire commander keyboard navigation into dual pane"
```

---

### Task 10: Apply filter to file list entries

**Files:**
- Modify: `apps/ui/src/features/sftp/components/LocalPane.tsx`
- Modify: `apps/ui/src/features/sftp/components/RemotePane.tsx`
- Modify: `apps/ui/src/features/sftp/components/FileList.tsx`

**Step 1: Filter entries before passing to FileList**

In each pane, read filter text from store and filter entries:

```typescript
const filterText = useStore(store, (state) => state.localFilterText); // or remoteFilterText

const filteredEntries = useMemo(() => {
  if (!filterText) return localEntries; // or remoteEntries
  const lower = filterText.toLowerCase();
  return localEntries.filter((entry) => entry.name.toLowerCase().includes(lower));
}, [localEntries, filterText]);
```

Pass `filteredEntries` to `<FileList entries={filteredEntries} ... />`.

**Step 2: Ensure cursor stays in bounds when filter changes**

After filtering, clamp cursor index:
```typescript
useEffect(() => {
  const maxIndex = Math.max(0, filteredEntries.length - 1);
  if (cursorIndex > maxIndex) {
    store.getState().setCursorIndex("local", maxIndex); // or "remote"
  }
}, [filteredEntries.length, cursorIndex, store]);
```

**Step 3: Run tests and build**

Run: `pnpm --filter @hypershell/ui test -- --run && pnpm --filter @hypershell/ui build`
Expected: All PASS, build succeeds

**Step 4: Commit**

```bash
git add apps/ui/src/features/sftp/components/LocalPane.tsx apps/ui/src/features/sftp/components/RemotePane.tsx
git commit -m "feat(sftp): apply quick filter to file list entries"
```

---

### Task 11: Scroll cursor into view

**Files:**
- Modify: `apps/ui/src/features/sftp/components/FileList.tsx`

**Step 1: Auto-scroll to cursor row**

Add a ref callback on the cursor row to scroll it into view when cursor changes:

```tsx
const cursorRowRef = useCallback((node: HTMLTableRowElement | null) => {
  node?.scrollIntoView({ block: "nearest" });
}, []);
```

On each `<tr>`, conditionally set the ref:
```tsx
ref={cursorIndex === index ? cursorRowRef : undefined}
```

**Step 2: Run build**

Run: `pnpm --filter @hypershell/ui build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/components/FileList.tsx
git commit -m "feat(sftp): auto-scroll to keep cursor row visible"
```

---

### Task 12: Final integration test and cleanup

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `pnpm test -- --run`
Expected: All workspace tests pass

**Step 2: Run build**

Run: `pnpm build`
Expected: All workspaces build successfully

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No lint errors. Fix any that appear.

**Step 4: Manual smoke test checklist**

Start the app (`pnpm --filter @hypershell/desktop dev`) and verify:
- [ ] File rows are ~24px tall, no excess spacing
- [ ] Monochrome SVG icons show for folders, code files, text files, images, archives
- [ ] Folder names are medium weight, folder icons are accent colored
- [ ] Alternating row backgrounds visible (subtle)
- [ ] Toolbar is one compact bar with filter input
- [ ] Breadcrumb is inline in the pane header bar
- [ ] Arrow keys / j/k move cursor highlight
- [ ] Enter opens folders, edits files
- [ ] Tab switches between panes (accent border moves)
- [ ] Space toggles selection
- [ ] F2 renames, F5 transfers, F7 creates folder, F8 deletes
- [ ] Ctrl+F focuses filter, typing filters entries
- [ ] Ctrl+L makes breadcrumb editable
- [ ] Escape clears filter and selection
- [ ] Backspace goes up one directory
- [ ] PageUp/PageDown jumps 20 entries

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore(sftp): final cleanup for VS Code Commander UI overhaul"
```
