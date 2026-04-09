# Phase 2 Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new features to HyperShell — interactive pane resizing, custom themes with editor, workspace profiles with auto-recovery, SSH key manager, and SFTP sync engine.

**Architecture:** Each feature follows the existing IPC contract pattern: Zod schemas in `@hypershell/shared`, IPC handlers in `apps/desktop`, preload bridge methods in `desktopApi.ts`, and React UI in `apps/ui`. State managed via Zustand stores. Data persisted in SQLite via repository pattern.

**Tech Stack:** TypeScript strict, Zod, Zustand, xterm.js, better-sqlite3, Electron IPC, React, Tailwind CSS.

---

## Feature 1: Interactive Pane Resizing

### Task 1.1: Add Pane Direction and Size to Layout Store

**Files:**
- Modify: `apps/ui/src/features/layout/layoutStore.ts`
- Test: `apps/ui/src/features/layout/layoutStore.test.ts`

**Step 1: Write the failing test**

```typescript
// In layoutStore.test.ts, add:
it("splitPane stores direction and default sizes", () => {
  const store = createLayoutStore();
  store.getState().splitPane("sess-1", "horizontal");
  const state = store.getState();
  expect(state.panes).toHaveLength(2);
  expect(state.splitDirection).toBe("horizontal");
  expect(state.paneSizes).toEqual([50, 50]);
});

it("splitPane vertical creates vertical split", () => {
  const store = createLayoutStore();
  store.getState().splitPane("sess-1", "vertical");
  expect(store.getState().splitDirection).toBe("vertical");
});

it("setPaneSizes updates sizes array", () => {
  const store = createLayoutStore();
  store.getState().splitPane("sess-1", "horizontal");
  store.getState().setPaneSizes([30, 70]);
  expect(store.getState().paneSizes).toEqual([30, 70]);
});

it("closePane resets to single pane sizes", () => {
  const store = createLayoutStore();
  store.getState().splitPane("sess-1", "horizontal");
  expect(store.getState().panes).toHaveLength(2);
  store.getState().closePane("pane-2");
  expect(store.getState().panes).toHaveLength(1);
  expect(store.getState().paneSizes).toEqual([100]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- --run layoutStore`
Expected: FAIL — `splitPane` doesn't accept direction, `splitDirection`/`paneSizes`/`setPaneSizes` don't exist

**Step 3: Write minimal implementation**

Update `layoutStore.ts`:

```typescript
// Add to LayoutState type:
splitDirection: "horizontal" | "vertical";
paneSizes: number[];
setPaneSizes: (sizes: number[]) => void;

// Change splitPane signature:
splitPane: (sessionId: string, direction?: "horizontal" | "vertical") => void;

// Add to initial state:
splitDirection: "horizontal" as const,
paneSizes: [100],

// Update splitPane implementation:
splitPane: (sessionId, direction) =>
  set((state) => {
    paneCounter++;
    const newPaneId = `pane-${paneCounter}`;
    const nextPanes = [...state.panes, { paneId: newPaneId, sessionId }];
    const equalSize = Math.round(100 / nextPanes.length);
    const sizes = nextPanes.map((_, i) =>
      i < nextPanes.length - 1 ? equalSize : 100 - equalSize * (nextPanes.length - 1)
    );
    return {
      panes: nextPanes,
      activePaneId: newPaneId,
      splitDirection: direction ?? state.splitDirection,
      paneSizes: sizes,
    };
  }),

// Update closePane to recalculate sizes:
closePane: (paneId) =>
  set((state) => {
    if (state.panes.length <= 1) return state;
    const nextPanes = state.panes.filter((p) => p.paneId !== paneId);
    const equalSize = Math.round(100 / nextPanes.length);
    const sizes = nextPanes.map((_, i) =>
      i < nextPanes.length - 1 ? equalSize : 100 - equalSize * (nextPanes.length - 1)
    );
    return {
      panes: nextPanes,
      activePaneId:
        state.activePaneId === paneId
          ? nextPanes[nextPanes.length - 1].paneId
          : state.activePaneId,
      paneSizes: sizes,
    };
  }),

// Add setPaneSizes:
setPaneSizes: (sizes) => set({ paneSizes: sizes }),
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- --run layoutStore`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/layout/layoutStore.ts apps/ui/src/features/layout/layoutStore.test.ts
git commit -m "feat(layout): add split direction and pane sizes to layout store"
```

### Task 1.2: Build PaneResizeHandle Component

**Files:**
- Create: `apps/ui/src/features/layout/PaneResizeHandle.tsx`

**Step 1: Write the component**

```tsx
import { useCallback, useRef, useEffect } from "react";

interface PaneResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd: () => void;
}

export function PaneResizeHandle({ direction, onResize, onResizeEnd }: PaneResizeHandleProps) {
  const dragging = useRef(false);
  const startPos = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const currentPos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResize(delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onResizeEnd();
      };

      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [direction, onResize, onResizeEnd]
  );

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={onMouseDown}
      className={[
        "relative flex-shrink-0 group",
        isHorizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      ].join(" ")}
    >
      {/* Visible line */}
      <div
        className={[
          "absolute bg-border/40 group-hover:bg-accent/50 transition-colors duration-150",
          isHorizontal ? "inset-y-0 left-0 w-px" : "inset-x-0 top-0 h-px",
        ].join(" ")}
      />
      {/* Wider hit area */}
      <div
        className={[
          "absolute",
          isHorizontal ? "inset-y-0 -left-1 -right-1" : "inset-x-0 -top-1 -bottom-1",
        ].join(" ")}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/ui/src/features/layout/PaneResizeHandle.tsx
git commit -m "feat(layout): add PaneResizeHandle drag component"
```

### Task 1.3: Integrate Resize Handles into Workspace

**Files:**
- Modify: `apps/ui/src/features/layout/Workspace.tsx`

**Step 1: Update Workspace to use sizes and handles**

In `Workspace.tsx`, update the pane rendering section:

```tsx
// Add imports
import { PaneResizeHandle } from "./PaneResizeHandle";
import { useCallback, useRef } from "react";

// Inside Workspace component, before the return:
const splitDirection = useStore(layoutStore, (s) => s.splitDirection);
const paneSizes = useStore(layoutStore, (s) => s.paneSizes);
const setPaneSizes = useStore(layoutStore, (s) => s.setPaneSizes);
const containerRef = useRef<HTMLDivElement>(null);

const handleResize = useCallback(
  (index: number, delta: number) => {
    const container = containerRef.current;
    if (!container) return;
    const totalPx =
      splitDirection === "horizontal" ? container.offsetWidth : container.offsetHeight;
    if (totalPx === 0) return;
    const deltaPct = (delta / totalPx) * 100;
    const next = [...paneSizes];
    const minSize = 10; // minimum 10%
    const newLeft = next[index] + deltaPct;
    const newRight = next[index + 1] - deltaPct;
    if (newLeft >= minSize && newRight >= minSize) {
      next[index] = newLeft;
      next[index + 1] = newRight;
      setPaneSizes(next);
    }
  },
  [paneSizes, splitDirection, setPaneSizes]
);

// Replace the panes flex-row div with:
<div
  ref={containerRef}
  className={`flex-1 min-h-0 flex ${
    splitDirection === "horizontal" ? "flex-row" : "flex-col"
  }`}
>
  {panes.map((pane, i) => (
    <Fragment key={pane.paneId}>
      {i > 0 && (
        <PaneResizeHandle
          direction={splitDirection}
          onResize={(delta) => handleResize(i - 1, delta)}
          onResizeEnd={() => {}}
        />
      )}
      <div
        style={{
          [splitDirection === "horizontal" ? "width" : "height"]: `${paneSizes[i] ?? 100}%`,
        }}
        className="min-h-0 min-w-0"
      >
        <PaneView
          pane={pane}
          isActive={pane.paneId === activePaneId}
          activeSessionId={activeSessionId}
          onActivate={() => activatePane(pane.paneId)}
          onCloseTab={closeTab}
        />
      </div>
    </Fragment>
  ))}
</div>
```

Add `Fragment` to the React import.

**Step 2: Fix any callers of splitPane that don't pass direction**

Search codebase for `splitPane(` calls and ensure they still work (the `direction` parameter is optional with default).

**Step 3: Run tests and verify**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/ui/src/features/layout/Workspace.tsx
git commit -m "feat(layout): integrate drag-to-resize pane handles"
```

---

## Feature 2: Custom Themes & Theme Editor

### Task 2.1: Add Custom Theme Storage to Settings

**Files:**
- Modify: `apps/ui/src/features/settings/settingsStore.ts`
- Test: `apps/ui/src/features/settings/settingsStore.test.ts` (create if missing)

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window.hypershell before importing store
const mockSshterm = {
  getSetting: vi.fn().mockResolvedValue(null),
  updateSetting: vi.fn().mockResolvedValue({ key: "app.settings", value: "{}" }),
};
vi.stubGlobal("window", { hypershell: mockSshterm });

import { settingsStore, type TerminalTheme as CustomTheme } from "./settingsStore";

describe("settingsStore custom themes", () => {
  it("has empty customThemes by default", () => {
    const state = settingsStore.getState();
    expect(state.settings.customThemes).toEqual({});
  });

  it("saveCustomTheme adds a theme", async () => {
    const theme = {
      background: "#000000",
      foreground: "#ffffff",
      cursor: "#ffffff",
      cursorAccent: "#000000",
      selectionBackground: "rgba(255,255,255,0.3)",
      black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
      blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
      brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00",
      brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
      brightCyan: "#00ffff", brightWhite: "#ffffff",
    };
    await settingsStore.getState().saveCustomTheme("myTheme", theme);
    expect(settingsStore.getState().settings.customThemes?.["myTheme"]).toEqual(theme);
  });

  it("deleteCustomTheme removes a theme", async () => {
    await settingsStore.getState().deleteCustomTheme("myTheme");
    expect(settingsStore.getState().settings.customThemes?.["myTheme"]).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- --run settingsStore`
Expected: FAIL — `customThemes`, `saveCustomTheme`, `deleteCustomTheme` don't exist

**Step 3: Write minimal implementation**

In `settingsStore.ts`, add:

```typescript
// Import TerminalTheme type
import type { TerminalTheme } from "../terminal/terminalTheme";

// Add to AppSettings:
customThemes?: Record<string, TerminalTheme>;

// Add to DEFAULT_APP_SETTINGS:
customThemes: {},

// Add to SettingsState:
saveCustomTheme: (name: string, theme: TerminalTheme) => Promise<void>;
deleteCustomTheme: (name: string) => Promise<void>;

// Add to store implementation:
saveCustomTheme: async (name, theme) => {
  const current = get().settings;
  const next: AppSettings = {
    ...current,
    customThemes: { ...current.customThemes, [name]: theme },
  };
  set({ settings: next });
  try {
    await window.hypershell?.updateSetting({
      key: SETTINGS_KEY,
      value: JSON.stringify(next),
    });
  } catch {}
},

deleteCustomTheme: async (name) => {
  const current = get().settings;
  const { [name]: _, ...rest } = current.customThemes ?? {};
  const next: AppSettings = { ...current, customThemes: rest };
  set({ settings: next });
  try {
    await window.hypershell?.updateSetting({
      key: SETTINGS_KEY,
      value: JSON.stringify(next),
    });
  } catch {}
},

// Update load() to merge customThemes:
// In the parsed section, add:
customThemes: parsed.customThemes ?? {},
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- --run settingsStore`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/settings/settingsStore.ts apps/ui/src/features/settings/settingsStore.test.ts
git commit -m "feat(settings): add custom theme storage to settings store"
```

### Task 2.2: Update Theme Resolution to Include Custom Themes

**Files:**
- Modify: `apps/ui/src/features/terminal/terminalTheme.ts`
- Test: `apps/ui/src/features/terminal/terminalTheme.test.ts`

**Step 1: Write the failing test**

```typescript
it("resolveTerminalTheme returns custom theme when provided", () => {
  const custom: TerminalTheme = {
    background: "#111111",
    foreground: "#eeeeee",
    cursor: "#eeeeee",
    cursorAccent: "#111111",
    selectionBackground: "rgba(255,255,255,0.3)",
    black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
    blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
    brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00",
    brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
    brightCyan: "#00ffff", brightWhite: "#ffffff",
  };
  const result = resolveTerminalTheme("myCustom", { myCustom: custom });
  expect(result).toEqual(custom);
});

it("resolveTerminalTheme falls back to built-in when custom not found", () => {
  const result = resolveTerminalTheme("dracula", {});
  expect(result).toBe(terminalThemes["dracula"]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- --run terminalTheme`
Expected: FAIL — `resolveTerminalTheme` doesn't accept second argument

**Step 3: Update resolveTerminalTheme**

```typescript
export function resolveTerminalTheme(
  themeName?: string,
  customThemes?: Record<string, TerminalTheme>
): TerminalTheme {
  const name = themeName ?? "";
  return customThemes?.[name] ?? terminalThemes[name] ?? terminalThemes["default"];
}
```

Also update `getTerminalOptions` to accept and pass `customThemes`:

```typescript
export function getTerminalOptions(settings?: {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  cursorBlink?: boolean;
  scrollback?: number;
  theme?: string;
  customThemes?: Record<string, TerminalTheme>;
}): typeof terminalOptions {
  const resolvedTheme = resolveTerminalTheme(settings?.theme, settings?.customThemes);
  // ... rest unchanged
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- --run terminalTheme`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/ui/src/features/terminal/terminalTheme.ts apps/ui/src/features/terminal/terminalTheme.test.ts
git commit -m "feat(theme): support custom themes in theme resolution"
```

### Task 2.3: Build Theme Editor UI

**Files:**
- Create: `apps/ui/src/features/settings/ThemeEditor.tsx`

**Step 1: Write the component**

```tsx
import { useState } from "react";
import { useStore } from "zustand";
import { settingsStore } from "./settingsStore";
import type { TerminalTheme } from "../terminal/terminalTheme";
import { terminalThemes } from "../terminal/terminalTheme";

const THEME_KEYS: (keyof TerminalTheme)[] = [
  "background", "foreground", "cursor", "cursorAccent", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20";

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function ThemeEditor({ onClose }: { onClose: () => void }) {
  const saveCustomTheme = useStore(settingsStore, (s) => s.saveCustomTheme);
  const [name, setName] = useState("");
  const [baseTheme, setBaseTheme] = useState("default");
  const [colors, setColors] = useState<TerminalTheme>({ ...terminalThemes["default"] });

  const handleBaseChange = (key: string) => {
    setBaseTheme(key);
    setColors({ ...terminalThemes[key] });
  };

  const handleColorChange = (key: keyof TerminalTheme, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await saveCustomTheme(trimmed, colors);
    onClose();
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">New Custom Theme</span>
        <button
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Theme Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Theme"
          className={inputClasses}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Base Theme</span>
        <select
          value={baseTheme}
          onChange={(e) => handleBaseChange(e.target.value)}
          className={inputClasses}
        >
          {Object.keys(terminalThemes).map((key) => (
            <option key={key} value={key}>{formatLabel(key)}</option>
          ))}
        </select>
      </label>

      {/* Preview strip */}
      <div
        className="rounded-lg p-3 font-mono text-xs leading-relaxed border border-border"
        style={{ background: colors.background, color: colors.foreground }}
      >
        <span style={{ color: colors.green }}>user@host</span>
        <span style={{ color: colors.white }}>:</span>
        <span style={{ color: colors.blue }}>~/project</span>
        <span style={{ color: colors.white }}>$ </span>
        <span style={{ color: colors.yellow }}>echo</span>
        <span style={{ color: colors.red }}> "hello"</span>
        <br />
        <span style={{ color: colors.cyan }}>hello</span>
      </div>

      {/* Color grid */}
      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
        {THEME_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="color"
              value={colors[key].startsWith("rgba") ? "#808080" : colors[key]}
              onChange={(e) => handleColorChange(key, e.target.value)}
              className="h-6 w-6 rounded border border-border cursor-pointer bg-transparent"
            />
            <span className="text-xs text-text-secondary truncate">{formatLabel(key)}</span>
          </label>
        ))}
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={!name.trim()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Save Theme
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/ui/src/features/settings/ThemeEditor.tsx
git commit -m "feat(settings): add ThemeEditor component with live preview"
```

### Task 2.4: Integrate Theme Editor into Settings Panel

**Files:**
- Modify: `apps/ui/src/features/settings/SettingsPanel.tsx`

**Step 1: Add custom theme display and editor toggle**

Add to the Theme section in `SettingsPanel.tsx`:

```tsx
import { useState } from "react"; // add to existing imports
import { ThemeEditor } from "./ThemeEditor";

// Inside SettingsPanel, add state:
const [showEditor, setShowEditor] = useState(false);
const customThemes = useStore(settingsStore, (s) => s.settings.customThemes ?? {});
const deleteCustomTheme = useStore(settingsStore, (s) => s.deleteCustomTheme);

// After the built-in theme grid, before </section>, add:

{/* Custom themes */}
{Object.entries(customThemes).length > 0 && (
  <div className="grid grid-cols-2 gap-2 mt-2">
    {Object.entries(customThemes).map(([key, themeObj]) => {
      const isActive = theme === key;
      return (
        <div key={key} className="relative group">
          <button
            type="button"
            onClick={() => void updateTerminal({ theme: key })}
            className={[
              "w-full flex flex-col gap-2 rounded-lg border p-3 text-left transition-all duration-150",
              isActive
                ? "border-accent/40 bg-accent/10"
                : "border-border bg-surface/60 hover:border-border-bright hover:bg-surface/80",
            ].join(" ")}
          >
            <div className="flex gap-1">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: themeObj.red }} />
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: themeObj.green }} />
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: themeObj.blue }} />
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: themeObj.yellow }} />
            </div>
            <span className="text-xs font-medium text-text-secondary">{key}</span>
          </button>
          <button
            onClick={() => void deleteCustomTheme(key)}
            className="absolute top-1 right-1 hidden group-hover:block p-1 rounded text-text-muted hover:text-danger text-xs"
            title="Delete theme"
          >
            &times;
          </button>
        </div>
      );
    })}
  </div>
)}

{showEditor ? (
  <div className="mt-3">
    <ThemeEditor onClose={() => setShowEditor(false)} />
  </div>
) : (
  <button
    onClick={() => setShowEditor(true)}
    className="mt-3 w-full rounded-lg border border-dashed border-border py-2 text-xs text-text-muted hover:text-text-secondary hover:border-border-bright transition-colors"
  >
    + Create Custom Theme
  </button>
)}
```

**Step 2: Run tests**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/ui/src/features/settings/SettingsPanel.tsx
git commit -m "feat(settings): integrate theme editor and custom theme selection"
```

### Task 2.5: Wire Custom Themes Through to Terminal

**Files:**
- Modify: any component that calls `getTerminalOptions` — search for it

**Step 1: Find and update callers**

Search for `getTerminalOptions` usage. Pass `customThemes` from settings store alongside the existing settings object. This ensures terminals render using the selected custom theme.

Typically in the terminal pane or hook that creates xterm instance:

```typescript
const customThemes = useStore(settingsStore, (s) => s.settings.customThemes);
// When calling getTerminalOptions, add customThemes:
const opts = getTerminalOptions({ ...settings.terminal, customThemes });
```

**Step 2: Run full test suite**

Run: `pnpm --filter @hypershell/ui test -- --run`
Expected: PASS

**Step 3: Commit**

```bash
git commit -am "feat(terminal): pass custom themes through to xterm options"
```

---

## Feature 3: Workspace Profiles & Auto-Recovery

### Task 3.1: Add Workspace IPC Channels and Schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add channels**

In `channels.ts`, add:

```typescript
export const workspaceChannels = {
  save: "workspace:save",
  load: "workspace:load",
  list: "workspace:list",
  remove: "workspace:remove",
  saveLast: "workspace:save-last",
  loadLast: "workspace:load-last",
} as const;
```

Add `workspace: workspaceChannels` to `ipcChannels`.

**Step 2: Add schemas**

In `schemas.ts`, add:

```typescript
export const workspaceTabSchema = z.object({
  transport: transportSchema,
  profileId: z.string().min(1),
  title: z.string(),
  type: z.enum(["terminal", "sftp"]).optional(),
  hostId: z.string().optional(),
});

export const workspaceLayoutSchema = z.object({
  tabs: z.array(workspaceTabSchema),
  splitDirection: z.enum(["horizontal", "vertical"]),
  paneSizes: z.array(z.number()),
  paneCount: z.number().int().min(1),
});

export const saveWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
  layout: workspaceLayoutSchema,
});

export const loadWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
});

export const removeWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
});

export const workspaceRecordSchema = z.object({
  name: z.string().min(1),
  layout: workspaceLayoutSchema,
  updatedAt: z.string(),
});

export type WorkspaceTab = z.infer<typeof workspaceTabSchema>;
export type WorkspaceLayout = z.infer<typeof workspaceLayoutSchema>;
export type SaveWorkspaceRequest = z.infer<typeof saveWorkspaceRequestSchema>;
export type LoadWorkspaceRequest = z.infer<typeof loadWorkspaceRequestSchema>;
export type RemoveWorkspaceRequest = z.infer<typeof removeWorkspaceRequestSchema>;
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
```

**Step 3: Export from shared index**

Ensure the new types and schemas are exported from `packages/shared/src/index.ts`.

**Step 4: Build shared to verify**

Run: `pnpm --filter @hypershell/shared build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts packages/shared/src/index.ts
git commit -m "feat(shared): add workspace IPC channels and Zod schemas"
```

### Task 3.2: Add Workspace Repository

**Files:**
- Create: `packages/db/src/repositories/workspaceRepository.ts`
- Test: `packages/db/src/repositories/workspaceRepository.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkspaceRepository } from "./workspaceRepository";

function createMockDb() {
  const store = new Map<string, { name: string; layout_json: string; updated_at: string }>();
  return {
    prepare: vi.fn((sql: string) => ({
      run: vi.fn((...args: any[]) => {
        if (sql.includes("INSERT OR REPLACE")) {
          store.set(args[0], {
            name: args[0],
            layout_json: args[1],
            updated_at: new Date().toISOString(),
          });
        } else if (sql.includes("DELETE")) {
          store.delete(args[0]);
        }
      }),
      get: vi.fn((name: string) => store.get(name) ?? undefined),
      all: vi.fn(() => [...store.values()]),
    })),
  };
}

describe("workspaceRepository", () => {
  it("saves and loads a workspace", () => {
    const db = createMockDb();
    const repo = createWorkspaceRepository(db as any);
    const layout = { tabs: [], splitDirection: "horizontal", paneSizes: [100], paneCount: 1 };
    repo.save("dev", layout);
    const result = repo.load("dev");
    expect(result).toBeDefined();
    expect(result!.name).toBe("dev");
  });

  it("lists workspaces", () => {
    const db = createMockDb();
    const repo = createWorkspaceRepository(db as any);
    repo.save("a", { tabs: [], splitDirection: "horizontal", paneSizes: [100], paneCount: 1 });
    repo.save("b", { tabs: [], splitDirection: "vertical", paneSizes: [100], paneCount: 1 });
    expect(repo.list()).toHaveLength(2);
  });

  it("removes a workspace", () => {
    const db = createMockDb();
    const repo = createWorkspaceRepository(db as any);
    repo.save("a", { tabs: [], splitDirection: "horizontal", paneSizes: [100], paneCount: 1 });
    repo.remove("a");
    expect(repo.load("a")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/db test -- --run workspaceRepository`
Expected: FAIL — module doesn't exist

**Step 3: Write implementation**

```typescript
// workspaceRepository.ts
import type { Database } from "better-sqlite3";

export interface WorkspaceLayout {
  tabs: Array<{
    transport: string;
    profileId: string;
    title: string;
    type?: string;
    hostId?: string;
  }>;
  splitDirection: "horizontal" | "vertical";
  paneSizes: number[];
  paneCount: number;
}

export interface WorkspaceRecord {
  name: string;
  layout: WorkspaceLayout;
  updatedAt: string;
}

export interface WorkspaceRepository {
  save(name: string, layout: WorkspaceLayout): void;
  load(name: string): WorkspaceRecord | undefined;
  list(): WorkspaceRecord[];
  remove(name: string): boolean;
}

export function createWorkspaceRepository(db: Database): WorkspaceRepository {
  return {
    save(name, layout) {
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO session_layouts (id, name, layout_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      );
      stmt.run(name, name, JSON.stringify(layout));
    },

    load(name) {
      const stmt = db.prepare("SELECT name, layout_json, updated_at FROM session_layouts WHERE name = ?");
      const row = stmt.get(name) as { name: string; layout_json: string; updated_at: string } | undefined;
      if (!row) return undefined;
      return {
        name: row.name,
        layout: JSON.parse(row.layout_json),
        updatedAt: row.updated_at,
      };
    },

    list() {
      const stmt = db.prepare("SELECT name, layout_json, updated_at FROM session_layouts ORDER BY updated_at DESC");
      const rows = stmt.all() as Array<{ name: string; layout_json: string; updated_at: string }>;
      return rows.map((row) => ({
        name: row.name,
        layout: JSON.parse(row.layout_json),
        updatedAt: row.updated_at,
      }));
    },

    remove(name) {
      const stmt = db.prepare("DELETE FROM session_layouts WHERE name = ?");
      const result = stmt.run(name);
      return result.changes > 0;
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/db test -- --run workspaceRepository`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/db/src/repositories/workspaceRepository.ts packages/db/src/repositories/workspaceRepository.test.ts
git commit -m "feat(db): add workspace repository using session_layouts table"
```

### Task 3.3: Add Workspace IPC Handlers

**Files:**
- Create: `apps/desktop/src/main/ipc/workspaceIpc.ts`

**Step 1: Write IPC handler**

Follow the pattern from `settingsIpc.ts`:

```typescript
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  ipcChannels,
  saveWorkspaceRequestSchema,
  loadWorkspaceRequestSchema,
  removeWorkspaceRequestSchema,
} from "@hypershell/shared";
import { createWorkspaceRepository } from "@hypershell/db";

let repo: ReturnType<typeof createWorkspaceRepository> | null = null;

export function registerWorkspaceIpc(db: unknown): void {
  repo = createWorkspaceRepository(db as any);

  ipcMain.handle(ipcChannels.workspace.save, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = saveWorkspaceRequestSchema.parse(request);
    repo!.save(parsed.name, parsed.layout);
    return { success: true };
  });

  ipcMain.handle(ipcChannels.workspace.load, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = loadWorkspaceRequestSchema.parse(request);
    return repo!.load(parsed.name) ?? null;
  });

  ipcMain.handle(ipcChannels.workspace.list, () => {
    return repo!.list();
  });

  ipcMain.handle(ipcChannels.workspace.remove, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = removeWorkspaceRequestSchema.parse(request);
    const removed = repo!.remove(parsed.name);
    if (!removed) throw new Error(`Workspace "${parsed.name}" not found`);
    return { success: true };
  });

  // Auto-save/load "last" workspace using reserved name "__last__"
  ipcMain.handle(ipcChannels.workspace.saveLast, (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = saveWorkspaceRequestSchema.omit({ name: true }).parse(request);
    repo!.save("__last__", parsed.layout);
    return { success: true };
  });

  ipcMain.handle(ipcChannels.workspace.loadLast, () => {
    return repo!.load("__last__") ?? null;
  });
}
```

**Step 2: Register in main IPC registration**

In `apps/desktop/src/main/ipc/registerIpc.ts`, import and call `registerWorkspaceIpc(db)`.

**Step 3: Build to verify**

Run: `pnpm --filter @hypershell/desktop build`
Expected: SUCCESS (or at least no TS errors — build may fail for unrelated native module reasons)

**Step 4: Commit**

```bash
git add apps/desktop/src/main/ipc/workspaceIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add workspace IPC handlers for save/load/list/remove"
```

### Task 3.4: Add Workspace Methods to Preload Bridge

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`

**Step 1: Add workspace methods to DesktopApi interface and implementation**

Add to `DesktopApi`:

```typescript
workspaceSave(request: SaveWorkspaceRequest): Promise<{ success: boolean }>;
workspaceLoad(request: LoadWorkspaceRequest): Promise<WorkspaceRecord | null>;
workspaceList(): Promise<WorkspaceRecord[]>;
workspaceRemove(request: RemoveWorkspaceRequest): Promise<void>;
workspaceSaveLast(layout: WorkspaceLayout): Promise<void>;
workspaceLoadLast(): Promise<WorkspaceRecord | null>;
```

Add corresponding implementations following the same `ipcRenderer.invoke` + Zod parse pattern.

**Step 2: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts
git commit -m "feat(preload): expose workspace IPC methods to renderer"
```

### Task 3.5: Build Workspace Manager UI

**Files:**
- Create: `apps/ui/src/features/workspace/WorkspaceMenu.tsx`

**Step 1: Write the component**

A dropdown menu (accessible from the tab bar or sidebar) that shows:
- "Save Workspace" — prompts for name, serializes current layout store state
- List of saved workspaces — click to restore
- Delete button per workspace

```tsx
import { useState, useEffect } from "react";
import { layoutStore } from "../layout/layoutStore";

interface WorkspaceRecord {
  name: string;
  updatedAt: string;
}

export function WorkspaceMenu({ onClose }: { onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const list = await window.hypershell?.workspaceList?.();
    if (list) setWorkspaces(list.filter((w: any) => w.name !== "__last__"));
  };

  useEffect(() => { void refresh(); }, []);

  const handleSave = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const state = layoutStore.getState();
    const layout = {
      tabs: state.tabs.map((t) => ({
        transport: t.transport ?? "ssh",
        profileId: t.profileId ?? t.sessionId,
        title: t.title,
        type: t.type,
        hostId: t.hostId,
      })),
      splitDirection: state.splitDirection,
      paneSizes: state.paneSizes,
      paneCount: state.panes.length,
    };
    await window.hypershell?.workspaceSave?.({ name: trimmed, layout });
    setNewName("");
    setSaving(false);
    await refresh();
  };

  const handleLoad = async (name: string) => {
    const result = await window.hypershell?.workspaceLoad?.({ name });
    if (!result?.layout) return;
    // Close existing tabs, then open workspace tabs
    const currentTabs = layoutStore.getState().tabs;
    for (const tab of currentTabs) {
      void window.hypershell?.closeSession?.({ sessionId: tab.sessionId }).catch(() => {});
    }
    layoutStore.setState({ tabs: [], activeSessionId: null, panes: [{ paneId: "pane-1", sessionId: null }] });

    // Re-open sessions from workspace
    for (const tab of result.layout.tabs) {
      // Dispatch open-tab actions that will trigger connection
      layoutStore.getState().openTab({
        sessionId: `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: tab.title,
        transport: tab.transport as "ssh" | "serial" | "sftp",
        profileId: tab.profileId,
        type: (tab.type as "terminal" | "sftp") ?? "terminal",
        hostId: tab.hostId,
      });
    }

    if (result.layout.splitDirection) {
      layoutStore.setState({ splitDirection: result.layout.splitDirection });
    }
    if (result.layout.paneSizes) {
      layoutStore.setState({ paneSizes: result.layout.paneSizes });
    }
    onClose();
  };

  const handleRemove = async (name: string) => {
    await window.hypershell?.workspaceRemove?.({ name });
    await refresh();
  };

  return (
    <div className="absolute top-8 right-0 z-50 w-64 rounded-lg border border-border bg-base-800 shadow-xl p-3 grid gap-3">
      <div className="text-xs font-semibold text-text-primary">Workspaces</div>

      {workspaces.length > 0 && (
        <div className="grid gap-1 max-h-40 overflow-y-auto">
          {workspaces.map((ws) => (
            <div key={ws.name} className="flex items-center justify-between group">
              <button
                onClick={() => void handleLoad(ws.name)}
                className="flex-1 text-left text-xs text-text-secondary hover:text-text-primary px-2 py-1.5 rounded hover:bg-base-700 transition-colors truncate"
              >
                {ws.name}
              </button>
              <button
                onClick={() => void handleRemove(ws.name)}
                className="hidden group-hover:block px-1 text-text-muted hover:text-danger text-xs"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Workspace name"
          className="flex-1 rounded border border-border bg-surface/80 px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/40"
          onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
        />
        <button
          onClick={() => void handleSave()}
          disabled={!newName.trim() || saving}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Add workspace button to TabBar or AppShell**

Add a small icon button to the tab bar area that toggles `WorkspaceMenu`.

**Step 3: Commit**

```bash
git add apps/ui/src/features/workspace/
git commit -m "feat(workspace): add workspace save/load/remove UI"
```

### Task 3.6: Add Auto-Save on Window Close

**Files:**
- Modify: `apps/desktop/src/main/main.ts` (or wherever `before-quit` / `window-all-closed` is handled)

**Step 1: Add auto-save**

Before app quit, serialize the current workspace and save as `__last__`. On app start, check for `__last__` and offer to restore.

In the main process, listen for `before-quit`:

```typescript
app.on("before-quit", () => {
  // The renderer will have already sent a saveLast via IPC
  // triggered by a 'beforeunload' event in the renderer
});
```

In the renderer (`apps/ui/src/main.tsx` or App component):

```typescript
window.addEventListener("beforeunload", () => {
  const state = layoutStore.getState();
  if (state.tabs.length === 0) return;
  const layout = {
    tabs: state.tabs.map((t) => ({
      transport: t.transport ?? "ssh",
      profileId: t.profileId ?? t.sessionId,
      title: t.title,
      type: t.type,
      hostId: t.hostId,
    })),
    splitDirection: state.splitDirection,
    paneSizes: state.paneSizes,
    paneCount: state.panes.length,
  };
  // Use sendSync for reliability during unload
  void window.hypershell?.workspaceSaveLast?.(layout);
});
```

On startup, check for `__last__` and show a restore banner if found.

**Step 2: Commit**

```bash
git commit -am "feat(workspace): auto-save layout on quit, restore on launch"
```

---

## Feature 4: SSH Key Manager

### Task 4.1: Add Key Manager IPC Channels and Schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add channels**

```typescript
export const sshKeyChannels = {
  list: "ssh-keys:list",
  generate: "ssh-keys:generate",
  getFingerprint: "ssh-keys:get-fingerprint",
  remove: "ssh-keys:remove",
} as const;
```

Add `sshKeys: sshKeyChannels` to `ipcChannels`.

**Step 2: Add schemas**

```typescript
export const sshKeyInfoSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["rsa", "ed25519", "ecdsa", "dsa", "unknown"]),
  bits: z.number().nullable(),
  fingerprint: z.string().nullable(),
  hasPublicKey: z.boolean(),
  createdAt: z.string().nullable(),
});

export const generateSshKeyRequestSchema = z.object({
  type: z.enum(["rsa", "ed25519", "ecdsa"]),
  bits: z.number().int().optional(), // only for RSA: 2048, 4096
  name: z.string().min(1), // filename (stored in ~/.ssh/)
  passphrase: z.string().optional(),
  comment: z.string().optional(),
});

export const removeSshKeyRequestSchema = z.object({
  path: z.string().min(1),
});

export const getFingerprintRequestSchema = z.object({
  path: z.string().min(1),
});

export type SshKeyInfo = z.infer<typeof sshKeyInfoSchema>;
export type GenerateSshKeyRequest = z.infer<typeof generateSshKeyRequestSchema>;
export type RemoveSshKeyRequest = z.infer<typeof removeSshKeyRequestSchema>;
export type GetFingerprintRequest = z.infer<typeof getFingerprintRequestSchema>;
```

**Step 3: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat(shared): add SSH key manager IPC channels and schemas"
```

### Task 4.2: Implement Key Manager IPC Handlers

**Files:**
- Create: `apps/desktop/src/main/ipc/sshKeysIpc.ts`

**Step 1: Write the handler**

```typescript
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { execFile } from "node:child_process";
import { readdir, stat, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";
import {
  ipcChannels,
  generateSshKeyRequestSchema,
  removeSshKeyRequestSchema,
  getFingerprintRequestSchema,
  type SshKeyInfo,
} from "@hypershell/shared";

const execFileAsync = promisify(execFile);

function sshDir(): string {
  return join(homedir(), ".ssh");
}

function detectKeyType(name: string): SshKeyInfo["type"] {
  if (name.startsWith("id_ed25519")) return "ed25519";
  if (name.startsWith("id_ecdsa")) return "ecdsa";
  if (name.startsWith("id_rsa")) return "rsa";
  if (name.startsWith("id_dsa")) return "dsa";
  return "unknown";
}

async function getFingerprint(keyPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("ssh-keygen", ["-lf", keyPath]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export function registerSshKeysIpc(): void {
  ipcMain.handle(ipcChannels.sshKeys.list, async () => {
    const dir = sshDir();
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    // Filter to private key files (no .pub extension, not config/known_hosts)
    const skipNames = new Set(["config", "known_hosts", "known_hosts.old", "authorized_keys", "environment"]);
    const privateKeys = entries.filter(
      (e) => !e.endsWith(".pub") && !skipNames.has(e) && !e.startsWith(".")
    );

    const results: SshKeyInfo[] = [];
    for (const name of privateKeys) {
      const keyPath = join(dir, name);
      try {
        const st = await stat(keyPath);
        if (!st.isFile()) continue;
        const hasPublicKey = entries.includes(`${name}.pub`);
        const fingerprint = await getFingerprint(keyPath);
        results.push({
          path: keyPath,
          name,
          type: detectKeyType(name),
          bits: null, // parsed from fingerprint if available
          fingerprint,
          hasPublicKey,
          createdAt: st.birthtime?.toISOString() ?? null,
        });
      } catch {
        continue;
      }
    }

    return results;
  });

  ipcMain.handle(ipcChannels.sshKeys.generate, async (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = generateSshKeyRequestSchema.parse(request);
    const keyPath = join(sshDir(), parsed.name);
    const args = [
      "-t", parsed.type,
      "-f", keyPath,
      "-N", parsed.passphrase ?? "",
      "-C", parsed.comment ?? "",
    ];
    if (parsed.type === "rsa" && parsed.bits) {
      args.push("-b", String(parsed.bits));
    }
    await execFileAsync("ssh-keygen", args);
    return { path: keyPath };
  });

  ipcMain.handle(ipcChannels.sshKeys.getFingerprint, async (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = getFingerprintRequestSchema.parse(request);
    const fingerprint = await getFingerprint(parsed.path);
    return { fingerprint };
  });

  ipcMain.handle(ipcChannels.sshKeys.remove, async (_event: IpcMainInvokeEvent, request: unknown) => {
    const parsed = removeSshKeyRequestSchema.parse(request);
    await unlink(parsed.path);
    // Also remove .pub if it exists
    try { await unlink(`${parsed.path}.pub`); } catch {}
    return { success: true };
  });
}
```

**Step 2: Register in registerIpc.ts**

**Step 3: Commit**

```bash
git add apps/desktop/src/main/ipc/sshKeysIpc.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat(desktop): add SSH key manager IPC handlers"
```

### Task 4.3: Add Key Manager to Preload Bridge

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`

**Step 1: Add methods to DesktopApi**

```typescript
sshKeysList(): Promise<SshKeyInfo[]>;
sshKeysGenerate(request: GenerateSshKeyRequest): Promise<{ path: string }>;
sshKeysGetFingerprint(request: GetFingerprintRequest): Promise<{ fingerprint: string | null }>;
sshKeysRemove(request: RemoveSshKeyRequest): Promise<void>;
```

Add implementations following standard pattern.

**Step 2: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts
git commit -m "feat(preload): expose SSH key manager to renderer"
```

### Task 4.4: Build SSH Key Manager UI

**Files:**
- Create: `apps/ui/src/features/ssh-keys/SshKeyManager.tsx`

**Step 1: Write the component**

```tsx
import { useState, useEffect } from "react";

interface SshKeyInfo {
  path: string;
  name: string;
  type: string;
  fingerprint: string | null;
  hasPublicKey: boolean;
  createdAt: string | null;
}

export function SshKeyManager() {
  const [keys, setKeys] = useState<SshKeyInfo[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genType, setGenType] = useState<"ed25519" | "rsa" | "ecdsa">("ed25519");
  const [genName, setGenName] = useState("");
  const [genPassphrase, setGenPassphrase] = useState("");
  const [genComment, setGenComment] = useState("");
  const [generating, setGenerating] = useState(false);

  const refresh = async () => {
    const result = await window.hypershell?.sshKeysList?.();
    if (result) setKeys(result);
  };

  useEffect(() => { void refresh(); }, []);

  const handleGenerate = async () => {
    if (!genName.trim()) return;
    setGenerating(true);
    try {
      await window.hypershell?.sshKeysGenerate?.({
        type: genType,
        name: genName.trim(),
        passphrase: genPassphrase || undefined,
        comment: genComment || undefined,
        bits: genType === "rsa" ? 4096 : undefined,
      });
      setGenName("");
      setGenPassphrase("");
      setGenComment("");
      setShowGenerate(false);
      await refresh();
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = async (path: string, name: string) => {
    if (!confirm(`Delete key "${name}" and its public key?`)) return;
    await window.hypershell?.sshKeysRemove?.({ path });
    await refresh();
  };

  const typeColors: Record<string, string> = {
    ed25519: "text-green-400",
    rsa: "text-blue-400",
    ecdsa: "text-yellow-400",
    dsa: "text-red-400",
    unknown: "text-text-muted",
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">SSH Keys</span>
        <button
          onClick={() => setShowGenerate(!showGenerate)}
          className="text-xs text-accent hover:text-accent/80 transition-colors"
        >
          {showGenerate ? "Cancel" : "+ Generate Key"}
        </button>
      </div>

      {showGenerate && (
        <div className="grid gap-3 p-3 rounded-lg border border-border bg-base-800">
          <select
            value={genType}
            onChange={(e) => setGenType(e.target.value as any)}
            className="rounded border border-border bg-surface/80 px-2 py-1.5 text-xs"
          >
            <option value="ed25519">ED25519 (recommended)</option>
            <option value="rsa">RSA (4096-bit)</option>
            <option value="ecdsa">ECDSA</option>
          </select>
          <input
            type="text"
            value={genName}
            onChange={(e) => setGenName(e.target.value)}
            placeholder="Filename (e.g. id_ed25519_work)"
            className="rounded border border-border bg-surface/80 px-2 py-1.5 text-xs"
          />
          <input
            type="password"
            value={genPassphrase}
            onChange={(e) => setGenPassphrase(e.target.value)}
            placeholder="Passphrase (optional)"
            className="rounded border border-border bg-surface/80 px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={genComment}
            onChange={(e) => setGenComment(e.target.value)}
            placeholder="Comment (e.g. user@machine)"
            className="rounded border border-border bg-surface/80 px-2 py-1.5 text-xs"
          />
          <button
            onClick={() => void handleGenerate()}
            disabled={!genName.trim() || generating}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-xs text-text-muted text-center py-6">
          No SSH keys found in ~/.ssh
        </div>
      ) : (
        <div className="grid gap-1">
          {keys.map((key) => (
            <div
              key={key.path}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-base-700/50 group transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary truncate">{key.name}</span>
                  <span className={`text-[10px] font-mono uppercase ${typeColors[key.type] ?? ""}`}>
                    {key.type}
                  </span>
                  {key.hasPublicKey && (
                    <span className="text-[10px] text-text-muted">.pub</span>
                  )}
                </div>
                {key.fingerprint && (
                  <div className="text-[10px] text-text-muted font-mono truncate mt-0.5">
                    {key.fingerprint}
                  </div>
                )}
              </div>
              <button
                onClick={() => void handleRemove(key.path, key.name)}
                className="hidden group-hover:block text-xs text-text-muted hover:text-danger transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Integrate into Settings or Sidebar**

Add the `SshKeyManager` as a new section in `SettingsPanel.tsx` or as a new sidebar panel.

**Step 3: Commit**

```bash
git add apps/ui/src/features/ssh-keys/
git commit -m "feat(ui): add SSH key manager with list, generate, delete"
```

---

## Feature 5: SFTP Sync Engine

### Task 5.1: Add Sync IPC Channels and Schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`
- Modify: `packages/shared/src/ipc/schemas.ts` or `packages/shared/src/ipc/sftpSchemas.ts`

**Step 1: Add channels**

```typescript
// Add to sftpChannels:
syncStart: "sftp:sync:start",
syncStop: "sftp:sync:stop",
syncList: "sftp:sync:list",
syncEvent: "sftp:sync:event",
```

**Step 2: Add schemas**

```typescript
export const sftpSyncConfigSchema = z.object({
  sftpSessionId: z.string().min(1),
  localPath: z.string().min(1),
  remotePath: z.string().min(1),
  direction: z.enum(["local-to-remote", "remote-to-local", "bidirectional"]),
  excludePatterns: z.array(z.string()).default([]),
  deleteOrphans: z.boolean().default(false),
});

export const sftpSyncStartRequestSchema = sftpSyncConfigSchema;

export const sftpSyncStopRequestSchema = z.object({
  syncId: z.string().min(1),
});

export const sftpSyncStatusSchema = z.object({
  syncId: z.string().min(1),
  status: z.enum(["scanning", "syncing", "idle", "error", "stopped"]),
  filesScanned: z.number().int(),
  filesSynced: z.number().int(),
  bytesTransferred: z.number(),
  lastError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});

export const sftpSyncEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sync-progress"),
    syncId: z.string(),
    filesScanned: z.number(),
    filesSynced: z.number(),
    currentFile: z.string(),
  }),
  z.object({
    kind: z.literal("sync-complete"),
    syncId: z.string(),
    filesSynced: z.number(),
    bytesTransferred: z.number(),
  }),
  z.object({
    kind: z.literal("sync-error"),
    syncId: z.string(),
    error: z.string(),
  }),
]);

export type SftpSyncConfig = z.infer<typeof sftpSyncConfigSchema>;
export type SftpSyncStartRequest = z.infer<typeof sftpSyncStartRequestSchema>;
export type SftpSyncStopRequest = z.infer<typeof sftpSyncStopRequestSchema>;
export type SftpSyncStatus = z.infer<typeof sftpSyncStatusSchema>;
export type SftpSyncEvent = z.infer<typeof sftpSyncEventSchema>;
```

**Step 3: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/sftpSchemas.ts
git commit -m "feat(shared): add SFTP sync IPC channels and schemas"
```

### Task 5.2: Build Sync Engine in Session Core

**Files:**
- Create: `packages/session-core/src/sftp/syncEngine.ts`
- Test: `packages/session-core/src/sftp/syncEngine.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { createSyncEngine, type SyncConfig } from "./syncEngine";

function createMockTransport() {
  return {
    list: vi.fn().mockResolvedValue({ entries: [] }),
    stat: vi.fn().mockResolvedValue({ size: 0, modifyTime: Date.now() / 1000, isDirectory: false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    createReadStream: vi.fn(),
    createWriteStream: vi.fn(),
  };
}

describe("syncEngine", () => {
  it("creates a sync engine with correct initial status", () => {
    const engine = createSyncEngine();
    expect(engine.list()).toEqual([]);
  });

  it("start creates a sync job and returns syncId", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const config: SyncConfig = {
      localPath: "/tmp/local",
      remotePath: "/home/user/remote",
      direction: "local-to-remote",
      excludePatterns: [],
      deleteOrphans: false,
    };
    const syncId = engine.start(transport as any, config);
    expect(syncId).toBeTruthy();
    expect(engine.list()).toHaveLength(1);
  });

  it("stop removes a sync job", () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const syncId = engine.start(transport as any, {
      localPath: "/tmp",
      remotePath: "/home",
      direction: "remote-to-local",
      excludePatterns: [],
      deleteOrphans: false,
    });
    engine.stop(syncId);
    expect(engine.list()).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/session-core test -- --run syncEngine`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { randomUUID } from "node:crypto";
import { readdir, stat as fsStat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SftpTransportHandle } from "../transports/sftpTransport";

export interface SyncConfig {
  localPath: string;
  remotePath: string;
  direction: "local-to-remote" | "remote-to-local" | "bidirectional";
  excludePatterns: string[];
  deleteOrphans: boolean;
}

export interface SyncStatus {
  syncId: string;
  status: "scanning" | "syncing" | "idle" | "error" | "stopped";
  filesScanned: number;
  filesSynced: number;
  bytesTransferred: number;
  lastError: string | null;
  lastSyncAt: string | null;
}

export type SyncEventListener = (event: SyncEvent) => void;

export type SyncEvent =
  | { kind: "sync-progress"; syncId: string; filesScanned: number; filesSynced: number; currentFile: string }
  | { kind: "sync-complete"; syncId: string; filesSynced: number; bytesTransferred: number }
  | { kind: "sync-error"; syncId: string; error: string };

interface ManagedSync {
  syncId: string;
  config: SyncConfig;
  transport: SftpTransportHandle;
  status: SyncStatus;
  aborted: boolean;
}

export interface SyncEngine {
  start(transport: SftpTransportHandle, config: SyncConfig): string;
  stop(syncId: string): void;
  list(): SyncStatus[];
  runOnce(syncId: string): Promise<void>;
  onEvent(listener: SyncEventListener): () => void;
}

export function createSyncEngine(): SyncEngine {
  const syncs = new Map<string, ManagedSync>();
  const listeners = new Set<SyncEventListener>();

  function emit(event: SyncEvent): void {
    for (const listener of listeners) listener(event);
  }

  function shouldExclude(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => filePath.includes(pattern));
  }

  async function scanLocalDir(dir: string): Promise<Array<{ relativePath: string; size: number; mtime: number }>> {
    const results: Array<{ relativePath: string; size: number; mtime: number }> = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile()) {
        const st = await fsStat(fullPath);
        results.push({ relativePath: entry.name, size: st.size, mtime: st.mtimeMs / 1000 });
      } else if (entry.isDirectory()) {
        const subEntries = await scanLocalDir(fullPath);
        for (const sub of subEntries) {
          results.push({ relativePath: join(entry.name, sub.relativePath), size: sub.size, mtime: sub.mtime });
        }
      }
    }
    return results;
  }

  return {
    start(transport, config) {
      const syncId = `sync-${randomUUID().replace(/-/g, "")}`;
      const managed: ManagedSync = {
        syncId,
        config,
        transport,
        aborted: false,
        status: {
          syncId,
          status: "idle",
          filesScanned: 0,
          filesSynced: 0,
          bytesTransferred: 0,
          lastError: null,
          lastSyncAt: null,
        },
      };
      syncs.set(syncId, managed);
      return syncId;
    },

    stop(syncId) {
      const managed = syncs.get(syncId);
      if (managed) {
        managed.aborted = true;
        managed.status.status = "stopped";
      }
      syncs.delete(syncId);
    },

    list() {
      return [...syncs.values()].map((s) => ({ ...s.status }));
    },

    async runOnce(syncId) {
      const managed = syncs.get(syncId);
      if (!managed || managed.aborted) return;

      const { config, transport } = managed;
      managed.status.status = "scanning";

      try {
        // Scan local files
        const localFiles = await scanLocalDir(config.localPath);
        managed.status.filesScanned = localFiles.length;

        // For each local file, check remote and upload if newer/missing
        if (config.direction === "local-to-remote" || config.direction === "bidirectional") {
          managed.status.status = "syncing";
          let synced = 0;

          for (const file of localFiles) {
            if (managed.aborted) break;
            if (shouldExclude(file.relativePath, config.excludePatterns)) continue;

            const remotePath = `${config.remotePath}/${file.relativePath.replace(/\\/g, "/")}`;
            let needsUpload = false;

            try {
              const remoteStat = await transport.stat(remotePath);
              if (file.mtime > remoteStat.modifyTime) {
                needsUpload = true;
              }
            } catch {
              needsUpload = true; // file doesn't exist remotely
            }

            if (needsUpload) {
              emit({
                kind: "sync-progress",
                syncId,
                filesScanned: managed.status.filesScanned,
                filesSynced: synced,
                currentFile: file.relativePath,
              });

              // Ensure remote directory exists
              const remoteDir = remotePath.substring(0, remotePath.lastIndexOf("/"));
              try { await transport.mkdir(remoteDir); } catch {}

              // Upload via streams (simplified — real impl would use transferManager pattern)
              const { createReadStream } = await import("node:fs");
              const localStream = createReadStream(join(config.localPath, file.relativePath));
              const remoteStream = transport.createWriteStream(remotePath);
              await new Promise<void>((resolve, reject) => {
                remoteStream.on("close", resolve);
                remoteStream.on("error", reject);
                localStream.on("error", reject);
                localStream.pipe(remoteStream);
              });

              synced++;
              managed.status.filesSynced = synced;
              managed.status.bytesTransferred += file.size;
            }
          }
        }

        managed.status.status = "idle";
        managed.status.lastSyncAt = new Date().toISOString();
        emit({
          kind: "sync-complete",
          syncId,
          filesSynced: managed.status.filesSynced,
          bytesTransferred: managed.status.bytesTransferred,
        });
      } catch (err) {
        managed.status.status = "error";
        managed.status.lastError = err instanceof Error ? err.message : String(err);
        emit({ kind: "sync-error", syncId, error: managed.status.lastError });
      }
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/session-core test -- --run syncEngine`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/session-core/src/sftp/syncEngine.ts packages/session-core/src/sftp/syncEngine.test.ts
git commit -m "feat(session-core): add SFTP sync engine with scan, diff, upload"
```

### Task 5.3: Add Sync IPC Handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc/sftpIpc.ts` (or create `sftpSyncIpc.ts`)

**Step 1: Add handlers for sync:start, sync:stop, sync:list**

Wire the sync engine to IPC channels. The `syncStart` handler creates a sync, runs `runOnce()`, and emits events to the renderer via `webContents.send()`.

**Step 2: Add to preload bridge**

**Step 3: Commit**

```bash
git commit -am "feat(desktop): add SFTP sync IPC handlers"
```

### Task 5.4: Build Sync UI Panel

**Files:**
- Create: `apps/ui/src/features/sftp/SyncPanel.tsx`

**Step 1: Write the component**

A panel shown in the SFTP dual-pane view that lets users:
- Select local and remote directories
- Choose sync direction (local->remote, remote->local, bidirectional)
- Add exclude patterns
- Start/stop sync
- View progress and status

**Step 2: Integrate into SftpDualPane**

Add a "Sync" button to the SFTP toolbar that toggles the sync panel.

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/SyncPanel.tsx
git commit -am "feat(ui): add SFTP sync panel with direction, excludes, progress"
```

---

## Summary

| Feature | Tasks | Key Files |
|---------|-------|-----------|
| 1. Pane Resizing | 1.1–1.3 | layoutStore.ts, PaneResizeHandle.tsx, Workspace.tsx |
| 2. Custom Themes | 2.1–2.5 | settingsStore.ts, terminalTheme.ts, ThemeEditor.tsx, SettingsPanel.tsx |
| 3. Workspaces | 3.1–3.6 | channels.ts, schemas.ts, workspaceRepository.ts, workspaceIpc.ts, desktopApi.ts, WorkspaceMenu.tsx |
| 4. SSH Key Manager | 4.1–4.4 | channels.ts, schemas.ts, sshKeysIpc.ts, desktopApi.ts, SshKeyManager.tsx |
| 5. SFTP Sync | 5.1–5.4 | channels.ts, sftpSchemas.ts, syncEngine.ts, sftpSyncIpc.ts, SyncPanel.tsx |

**Dependency order:** Features 1 and 2 are fully independent. Feature 3 depends on Feature 1 (for `splitDirection`/`paneSizes`). Features 4 and 5 are independent of each other and of 1–3.

**Recommended execution order:** 1 -> 2 -> 3 -> 4 + 5 (parallel)
