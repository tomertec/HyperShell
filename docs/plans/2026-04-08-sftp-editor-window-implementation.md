# SFTP Editor Window Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken inline SFTP file editor overlay with a full-featured, multi-tab editor in a separate Electron BrowserWindow.

**Architecture:** The editor window loads the same Vite renderer app via a `?window=editor&sftpSessionId=<id>` query param. `App.tsx` detects this and renders `EditorApp` instead of the main workbench. Main process manages editor windows per SFTP session and closes them when the session disconnects. Communication uses new IPC channels for open-file and session-closed events.

**Tech Stack:** Electron BrowserWindow, React, Zustand, CodeMirror 6, @codemirror/search, @replit/codemirror-minimap, existing preload bridge.

---

### Task 1: Install New Dependencies

**Files:**
- Modify: `apps/ui/package.json`

**Step 1: Install CodeMirror language packs and minimap**

Run:
```bash
pnpm --filter @sshterm/ui add @codemirror/lang-php @codemirror/lang-rust @codemirror/lang-go @codemirror/lang-java @codemirror/lang-cpp @codemirror/lang-sql @codemirror/search @replit/codemirror-minimap
```

**Step 2: Verify install**

Run: `pnpm --filter @sshterm/ui ls @replit/codemirror-minimap`
Expected: Shows the installed version.

**Step 3: Commit**

```bash
git add apps/ui/package.json pnpm-lock.yaml
git commit -m "feat(editor): add CodeMirror language packs and minimap dependency"
```

---

### Task 2: Add IPC Channels and Schemas for Editor Window

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts` (add `editorChannels` to the channels object)
- Modify: `packages/shared/src/ipc/sftpSchemas.ts` (add editor-related schemas)
- Modify: `packages/shared/src/index.ts` (export new schemas if needed)

**Step 1: Add editor IPC channel names**

In `packages/shared/src/ipc/channels.ts`, add before the `ipcChannels` const (before line 120):

```typescript
export const editorChannels = {
  openEditor: "editor:open",
  openFile: "editor:open-file",
  sessionClosed: "editor:session-closed",
} as const;
```

Then in the `ipcChannels` object (after `op: opChannels,` at line 135), add:

```typescript
  editor: editorChannels,
```

**Step 2: Add Zod schemas for editor IPC**

In `packages/shared/src/ipc/sftpSchemas.ts`, add at the end of the file:

```typescript
// -- Editor window schemas --

export const editorOpenRequestSchema = z.object({
  sftpSessionId: z.string(),
  remotePath: z.string(),
});
export type EditorOpenRequest = z.infer<typeof editorOpenRequestSchema>;

export const editorOpenFileSchema = z.object({
  sftpSessionId: z.string(),
  remotePath: z.string(),
});
export type EditorOpenFile = z.infer<typeof editorOpenFileSchema>;

export const editorSessionClosedSchema = z.object({
  sftpSessionId: z.string(),
});
export type EditorSessionClosed = z.infer<typeof editorSessionClosedSchema>;
```

**Step 3: Export new schemas from shared package**

Check `packages/shared/src/index.ts` and ensure the new schemas/types are exported. They should already be re-exported if `sftpSchemas.ts` is barrel-exported. If not, add the exports.

**Step 4: Build shared package to verify**

Run: `pnpm --filter @sshterm/shared build`
Expected: No errors.

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add editor IPC channels and Zod schemas"
```

---

### Task 3: Create Editor Window Factory (Main Process)

**Files:**
- Create: `apps/desktop/src/main/windows/createEditorWindow.ts`

**Step 1: Create the editor window factory**

Create `apps/desktop/src/main/windows/createEditorWindow.ts`:

```typescript
import { BrowserWindow } from "electron";
import path from "node:path";

export interface CreateEditorWindowOptions {
  sftpSessionId: string;
  parentWindow: BrowserWindow;
  rendererUrl: string;
}

export function createEditorWindow(options: CreateEditorWindowOptions): BrowserWindow {
  const { sftpSessionId, parentWindow, rendererUrl } = options;
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: "HyperShell Editor",
    backgroundColor: "#07111f",
    parent: parentWindow,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Append query params so the renderer knows to show the editor UI
  const separator = rendererUrl.includes("?") ? "&" : "?";
  const editorUrl = `${rendererUrl}${separator}window=editor&sftpSessionId=${encodeURIComponent(sftpSessionId)}`;
  void win.loadURL(editorUrl);

  return win;
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/windows/createEditorWindow.ts
git commit -m "feat(desktop): add createEditorWindow factory"
```

---

### Task 4: Create Editor Window Manager (Main Process)

**Files:**
- Create: `apps/desktop/src/main/windows/editorWindowManager.ts`

**Step 1: Create the window manager**

Create `apps/desktop/src/main/windows/editorWindowManager.ts`:

```typescript
import type { BrowserWindow } from "electron";
import { ipcChannels } from "@sshterm/shared";
import { createEditorWindow } from "./createEditorWindow";

interface ManagedEditorWindow {
  window: BrowserWindow;
  sftpSessionId: string;
}

export class EditorWindowManager {
  private editors: ManagedEditorWindow[] = [];
  private parentWindow: BrowserWindow | null = null;
  private rendererUrl = "";

  setParentWindow(window: BrowserWindow): void {
    this.parentWindow = window;
  }

  setRendererUrl(url: string): void {
    this.rendererUrl = url;
  }

  openEditor(sftpSessionId: string, remotePath: string): void {
    if (!this.parentWindow || this.parentWindow.isDestroyed()) {
      return;
    }

    // Check if an editor window already exists for this session
    const existing = this.editors.find(
      (e) => e.sftpSessionId === sftpSessionId && !e.window.isDestroyed()
    );

    if (existing) {
      // Send open-file event to existing window, then focus it
      existing.window.webContents.send(ipcChannels.editor.openFile, {
        sftpSessionId,
        remotePath,
      });
      existing.window.focus();
      return;
    }

    // Create new editor window
    const window = createEditorWindow({
      sftpSessionId,
      parentWindow: this.parentWindow,
      rendererUrl: this.rendererUrl,
    });

    const entry: ManagedEditorWindow = { window, sftpSessionId };
    this.editors.push(entry);

    // Once the window content is ready, send the initial file to open
    window.webContents.once("did-finish-load", () => {
      window.webContents.send(ipcChannels.editor.openFile, {
        sftpSessionId,
        remotePath,
      });
    });

    window.on("closed", () => {
      this.editors = this.editors.filter((e) => e !== entry);
    });
  }

  notifySessionClosed(sftpSessionId: string): void {
    for (const editor of this.editors) {
      if (editor.sftpSessionId === sftpSessionId && !editor.window.isDestroyed()) {
        editor.window.webContents.send(ipcChannels.editor.sessionClosed, {
          sftpSessionId,
        });
      }
    }
  }

  closeAll(): void {
    for (const editor of this.editors) {
      if (!editor.window.isDestroyed()) {
        editor.window.close();
      }
    }
    this.editors = [];
  }

  closeForSession(sftpSessionId: string): void {
    for (const editor of [...this.editors]) {
      if (editor.sftpSessionId === sftpSessionId && !editor.window.isDestroyed()) {
        editor.window.close();
      }
    }
  }
}

// Singleton
export const editorWindowManager = new EditorWindowManager();
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/windows/editorWindowManager.ts
git commit -m "feat(desktop): add EditorWindowManager singleton"
```

---

### Task 5: Register Editor IPC Handler and Wire Into Lifecycle

**Files:**
- Create: `apps/desktop/src/main/ipc/editorIpc.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts` (import and call `registerEditorIpc`)
- Modify: `apps/desktop/src/main/mainLifecycle.ts` (wire editorWindowManager)
- Modify: `apps/desktop/src/main/main.ts` (pass mainWindow to editorWindowManager)

**Step 1: Create editor IPC handler**

Create `apps/desktop/src/main/ipc/editorIpc.ts`:

```typescript
import type { IpcMainInvokeEvent } from "electron";
import { ipcChannels, editorOpenRequestSchema } from "@sshterm/shared";
import { editorWindowManager } from "../windows/editorWindowManager";

export function registerEditorIpc(
  ipcMain: { handle(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void }
): () => void {
  const handleOpenEditor = (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = editorOpenRequestSchema.parse(rawRequest);
    editorWindowManager.openEditor(request.sftpSessionId, request.remotePath);
  };

  ipcMain.handle(ipcChannels.editor.openEditor, handleOpenEditor);

  return () => {
    ipcMain.removeHandler?.(ipcChannels.editor.openEditor);
  };
}
```

Note: `ipcMain.removeHandler` may not be available depending on Electron version. Check how other handlers are unregistered in `registerIpc.ts` and follow the same pattern.

**Step 2: Register in registerIpc.ts**

In `apps/desktop/src/main/ipc/registerIpc.ts`:

1. Add import at top (after line 37): `import { registerEditorIpc } from "./editorIpc";`

2. Find where the other `register*Ipc()` calls happen and add:
```typescript
const unregisterEditor = registerEditorIpc(ipcMain);
```

3. In the cleanup/unregister function, call `unregisterEditor()`.

**Step 3: Wire EditorWindowManager into the main lifecycle**

In `apps/desktop/src/main/mainLifecycle.ts`:

1. Add import: `import { editorWindowManager } from "./windows/editorWindowManager";`

2. In the `bootstrap()` function, after `const window = createAndLoadMainWindow();` (line 117), add:
```typescript
editorWindowManager.setParentWindow(window as unknown as import("electron").BrowserWindow);
editorWindowManager.setRendererUrl(deps.getRendererUrl());
```

3. In `stopCurrentResources()` (around line 64), add before `mainWindow = null;`:
```typescript
editorWindowManager.closeAll();
```

**Step 4: Wire SFTP session disconnect to editor notification**

In `apps/desktop/src/main/ipc/sftpIpc.ts`, find where SFTP disconnect/exit events are handled. When an SFTP session disconnects, call:

```typescript
import { editorWindowManager } from "../windows/editorWindowManager";

// In the disconnect handler or session-exit event handler:
editorWindowManager.notifySessionClosed(sftpSessionId);
```

Look for the `handleDisconnect` function or the event handler that emits `"disconnected"` status and add the call there.

**Step 5: Add editor channel to the registered channels allowlist**

In `registerIpc.ts`, find the `registeredChannels` array and add:
```typescript
ipcChannels.editor.openEditor,
```

**Step 6: Build desktop to verify**

Run: `pnpm --filter @sshterm/desktop build`
Expected: No errors.

**Step 7: Commit**

```bash
git add apps/desktop/src/main/ipc/editorIpc.ts apps/desktop/src/main/ipc/registerIpc.ts apps/desktop/src/main/mainLifecycle.ts apps/desktop/src/main/ipc/sftpIpc.ts
git commit -m "feat(desktop): register editor IPC and wire lifecycle"
```

---

### Task 6: Add Preload Bridge Methods for Editor

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts` (add `editorOpen` method and `onEditorOpenFile`/`onEditorSessionClosed` listeners)
- Modify: `apps/ui/src/types/global.d.ts` (add new type declarations)

**Step 1: Add preload methods**

In `apps/desktop/src/preload/desktopApi.ts`:

1. Add schema imports at top:
```typescript
import { editorOpenRequestSchema, editorOpenFileSchema, editorSessionClosedSchema } from "@sshterm/shared";
import type { EditorOpenRequest, EditorOpenFile, EditorSessionClosed } from "@sshterm/shared";
```

2. Add to the `DesktopApi` interface (after `sftpWriteFile` around line 204):
```typescript
  editorOpen(request: EditorOpenRequest): Promise<void>;
  onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void;
  onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void;
```

3. Add implementations in the returned object (after the `sftpWriteFile` implementation around line 638):
```typescript
    async editorOpen(request: EditorOpenRequest): Promise<void> {
      const parsed = editorOpenRequestSchema.parse(request);
      await ipcRenderer.invoke(ipcChannels.editor.openEditor, parsed);
    },
    onEditorOpenFile(listener: (event: EditorOpenFile) => void): () => void {
      assertListener(listener, "onEditorOpenFile");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorOpenFileSchema.safeParse(payload);
        if (!parsed.success) return;
        try { listener(parsed.data); } catch {}
      };
      ipcRenderer.on(ipcChannels.editor.openFile, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.openFile, wrappedListener); };
    },
    onEditorSessionClosed(listener: (event: EditorSessionClosed) => void): () => void {
      assertListener(listener, "onEditorSessionClosed");
      const wrappedListener = (_event: unknown, payload: unknown) => {
        const parsed = editorSessionClosedSchema.safeParse(payload);
        if (!parsed.success) return;
        try { listener(parsed.data); } catch {}
      };
      ipcRenderer.on(ipcChannels.editor.sessionClosed, wrappedListener);
      return () => { ipcRenderer.removeListener(ipcChannels.editor.sessionClosed, wrappedListener); };
    },
```

**Step 2: Add type declarations**

In `apps/ui/src/types/global.d.ts`, add imports for the new types and add to the `sshterm` interface (after `sftpWriteFile` around line 100):

```typescript
      editorOpen?: (request: EditorOpenRequest) => Promise<void>;
      onEditorOpenFile?: (listener: (event: EditorOpenFile) => void) => () => void;
      onEditorSessionClosed?: (listener: (event: EditorSessionClosed) => void) => () => void;
```

Also add the type imports at the top of the file alongside the existing shared imports:

```typescript
import type { EditorOpenRequest, EditorOpenFile, EditorSessionClosed } from "@sshterm/shared";
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: No errors.

**Step 4: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat(preload): add editor IPC bridge methods and type declarations"
```

---

### Task 7: Expand Language Detection

**Files:**
- Modify: `apps/ui/src/features/sftp/utils/languageDetect.ts`

**Step 1: Add new language extensions**

Replace the content of `apps/ui/src/features/sftp/utils/languageDetect.ts` with:

```typescript
import type { Extension } from "@codemirror/state";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { php } from "@codemirror/lang-php";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { sql } from "@codemirror/lang-sql";

const EXTENSION_MAP: Record<string, () => Extension> = {
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(),
  py: () => python(),
  xml: () => xml(),
  yaml: () => yaml(),
  yml: () => yaml(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  md: () => markdown(),
  markdown: () => markdown(),
  php: () => php(),
  rs: () => rust(),
  go: () => go(),
  java: () => java(),
  c: () => cpp(),
  cpp: () => cpp(),
  cc: () => cpp(),
  h: () => cpp(),
  hpp: () => cpp(),
  sql: () => sql(),
  sh: () => javascript(), // basic highlighting for shell scripts
  bash: () => javascript(),
  ini: () => yaml(), // INI is close enough to YAML for basic highlighting
  toml: () => yaml(),
  conf: () => yaml(),
  cfg: () => yaml(),
  env: () => yaml(),
  properties: () => yaml(),
  svg: () => xml(),
  xsl: () => xml(),
  xsd: () => xml(),
  wsdl: () => xml(),
};

/** Map a file extension to a readable language name for the status bar. */
export function getLanguageName(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const names: Record<string, string> = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX",
    json: "JSON", py: "Python", xml: "XML", yaml: "YAML", yml: "YAML",
    html: "HTML", htm: "HTML", css: "CSS", md: "Markdown", markdown: "Markdown",
    php: "PHP", rs: "Rust", go: "Go", java: "Java",
    c: "C", cpp: "C++", cc: "C++", h: "C/C++ Header", hpp: "C++ Header",
    sql: "SQL", sh: "Shell", bash: "Bash",
    ini: "INI", toml: "TOML", conf: "Config", cfg: "Config",
    env: "Env", properties: "Properties",
    svg: "SVG", xsl: "XSLT", xsd: "XSD",
  };
  return names[ext] ?? "Plain Text";
}

export function getLanguageExtension(filename: string): Extension | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const factory = EXTENSION_MAP[extension];
  return factory ? factory() : null;
}
```

**Step 2: Build to verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/utils/languageDetect.ts
git commit -m "feat(editor): expand language detection to 30+ file types"
```

---

### Task 8: Create Editor Zustand Store

**Files:**
- Create: `apps/ui/src/features/editor/stores/editorStore.ts`

**Step 1: Create the store**

Create directory and file `apps/ui/src/features/editor/stores/editorStore.ts`:

```typescript
import { createStore } from "zustand/vanilla";

export interface EditorTab {
  id: string;
  remotePath: string;
  fileName: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  /** Cursor line (1-based) */
  cursorLine: number;
  /** Cursor column (1-based) */
  cursorCol: number;
  /** Language name for status bar */
  language: string;
}

export interface EditorSettings {
  wordWrap: boolean;
  fontSize: number;
  indentSize: number;
  indentWithTabs: boolean;
}

export interface EditorState {
  sftpSessionId: string;
  tabs: EditorTab[];
  activeTabId: string | null;
  sessionDisconnected: boolean;
  settings: EditorSettings;

  addTab: (tab: Omit<EditorTab, "cursorLine" | "cursorCol">) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, patch: Partial<EditorTab>) => void;
  setSessionDisconnected: () => void;
  updateSettings: (patch: Partial<EditorSettings>) => void;
}

export function createEditorStore(sftpSessionId: string) {
  return createStore<EditorState>((set) => ({
    sftpSessionId,
    tabs: [],
    activeTabId: null,
    sessionDisconnected: false,
    settings: {
      wordWrap: false,
      fontSize: 14,
      indentSize: 2,
      indentWithTabs: false,
    },

    addTab: (tab) =>
      set((state) => {
        // If tab for this path already exists, just activate it
        const existing = state.tabs.find((t) => t.remotePath === tab.remotePath);
        if (existing) {
          return { activeTabId: existing.id };
        }
        return {
          tabs: [...state.tabs, { ...tab, cursorLine: 1, cursorCol: 1 }],
          activeTabId: tab.id,
        };
      }),

    removeTab: (tabId) =>
      set((state) => {
        const idx = state.tabs.findIndex((t) => t.id === tabId);
        const newTabs = state.tabs.filter((t) => t.id !== tabId);
        let newActive = state.activeTabId;
        if (state.activeTabId === tabId) {
          // Activate adjacent tab
          const nextIdx = Math.min(idx, newTabs.length - 1);
          newActive = newTabs[nextIdx]?.id ?? null;
        }
        return { tabs: newTabs, activeTabId: newActive };
      }),

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

    updateTab: (tabId, patch) =>
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
      })),

    setSessionDisconnected: () => set({ sessionDisconnected: true }),

    updateSettings: (patch) =>
      set((state) => ({
        settings: { ...state.settings, ...patch },
      })),
  }));
}
```

**Step 2: Commit**

```bash
git add apps/ui/src/features/editor/stores/editorStore.ts
git commit -m "feat(editor): create Zustand store for editor tabs and settings"
```

---

### Task 9: Create Editor Components

**Files:**
- Create: `apps/ui/src/features/editor/components/EditorTabBar.tsx`
- Create: `apps/ui/src/features/editor/components/EditorToolbar.tsx`
- Create: `apps/ui/src/features/editor/components/EditorStatusBar.tsx`
- Create: `apps/ui/src/features/editor/components/EditorPane.tsx`

**Step 1: Create EditorTabBar**

Create `apps/ui/src/features/editor/components/EditorTabBar.tsx`:

```tsx
import { useStore } from "zustand";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorTabBarProps {
  store: StoreApi<EditorState>;
  onCloseTab: (tabId: string) => void;
}

export function EditorTabBar({ store, onCloseTab }: EditorTabBarProps) {
  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const setActiveTab = useStore(store, (s) => s.setActiveTab);

  return (
    <div className="flex items-center overflow-x-auto border-b border-base-700 bg-base-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`group flex items-center gap-2 border-r border-base-700 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? "bg-base-900 text-text-primary"
              : "text-text-secondary hover:bg-base-700/50 hover:text-text-primary"
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="max-w-[160px] truncate font-mono text-xs">
            {tab.fileName}
          </span>
          {tab.dirty && (
            <span className="h-2 w-2 rounded-full bg-yellow-400" title="Modified" />
          )}
          <span
            className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            title="Close"
          >
            &times;
          </span>
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Create EditorToolbar**

Create `apps/ui/src/features/editor/components/EditorToolbar.tsx`:

```tsx
import { useStore } from "zustand";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorToolbarProps {
  store: StoreApi<EditorState>;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}

export function EditorToolbar({ store, onSave, saving, disabled }: EditorToolbarProps) {
  const settings = useStore(store, (s) => s.settings);
  const updateSettings = useStore(store, (s) => s.updateSettings);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const tabs = useStore(store, (s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const canSave = activeTab?.dirty && !saving && !disabled;

  return (
    <div className="flex items-center justify-between border-b border-base-700 bg-base-800/80 px-3 py-1.5">
      <div className="flex items-center gap-3">
        {/* Word wrap toggle */}
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            settings.wordWrap
              ? "bg-accent/20 text-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
          onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
          title="Toggle word wrap"
        >
          Wrap
        </button>

        {/* Indent size */}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <span>Indent:</span>
          <select
            className="rounded border border-base-600 bg-base-700 px-1.5 py-0.5 text-xs text-text-primary"
            value={settings.indentSize}
            onChange={(e) => updateSettings({ indentSize: Number(e.target.value) })}
          >
            <option value={2}>2</option>
            <option value={4}>4</option>
            <option value={8}>8</option>
          </select>
        </div>

        {/* Font size */}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <span>Font:</span>
          <button
            type="button"
            className="rounded border border-base-600 px-1.5 py-0.5 text-xs hover:bg-base-700"
            onClick={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })}
          >
            -
          </button>
          <span className="w-6 text-center text-text-primary">{settings.fontSize}</span>
          <button
            type="button"
            className="rounded border border-base-600 px-1.5 py-0.5 text-xs hover:bg-base-700"
            onClick={() => updateSettings({ fontSize: Math.min(28, settings.fontSize + 1) })}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeTab?.error && (
          <span className="text-xs text-red-400">{activeTab.error}</span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Create EditorStatusBar**

Create `apps/ui/src/features/editor/components/EditorStatusBar.tsx`:

```tsx
import { useStore } from "zustand";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorStatusBarProps {
  store: StoreApi<EditorState>;
}

export function EditorStatusBar({ store }: EditorStatusBarProps) {
  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const settings = useStore(store, (s) => s.settings);
  const sessionDisconnected = useStore(store, (s) => s.sessionDisconnected);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab) return null;

  return (
    <div className="flex items-center justify-between border-t border-base-700 bg-base-800 px-3 py-1 text-xs text-text-secondary">
      <div className="flex items-center gap-4">
        <span>Ln {activeTab.cursorLine}, Col {activeTab.cursorCol}</span>
        <span>UTF-8</span>
        <span>{activeTab.language}</span>
        <span>{settings.indentWithTabs ? "Tabs" : "Spaces"}: {settings.indentSize}</span>
        <span>LF</span>
      </div>
      <div className="flex items-center gap-3">
        {sessionDisconnected && (
          <span className="font-medium text-red-400">Disconnected</span>
        )}
        {activeTab.remotePath && (
          <span className="max-w-[300px] truncate" title={activeTab.remotePath}>
            {activeTab.remotePath}
          </span>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Create EditorPane**

This is the main CodeMirror component with all features (search, minimap, line wrapping, font size, indent).

Create `apps/ui/src/features/editor/components/EditorPane.tsx`:

```tsx
import { useEffect, useRef, useCallback } from "react";
import { useStore } from "zustand";
import { EditorState as CMState, Compartment } from "@codemirror/state";
import { EditorView, basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { search, openSearchPanel } from "@codemirror/search";
import { indentUnit } from "@codemirror/language";
import { getLanguageExtension } from "../../sftp/utils/languageDetect";
import type { EditorState } from "../stores/editorStore";
import type { StoreApi } from "zustand/vanilla";

interface EditorPaneProps {
  store: StoreApi<EditorState>;
  tabId: string;
  content: string;
}

export function EditorPane({ store, tabId, content }: EditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const wrapCompartment = useRef(new Compartment());
  const fontCompartment = useRef(new Compartment());
  const indentCompartment = useRef(new Compartment());

  const settings = useStore(store, (s) => s.settings);
  const updateTab = useStore(store, (s) => s.updateTab);
  const tabs = useStore(store, (s) => s.tabs);
  const tab = tabs.find((t) => t.id === tabId);

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current || !tab) return;

    const languageExt = getLanguageExtension(tab.fileName);
    const extensions = [
      basicSetup,
      oneDark,
      search(),
      wrapCompartment.current.of(
        settings.wordWrap ? EditorView.lineWrapping : []
      ),
      fontCompartment.current.of(
        EditorView.theme({
          "&": { fontSize: `${settings.fontSize}px` },
          ".cm-gutters": { fontSize: `${settings.fontSize}px` },
        })
      ),
      indentCompartment.current.of(
        indentUnit.of(" ".repeat(settings.indentSize))
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          updateTab(tabId, {
            dirty: newContent !== tab.originalContent,
            content: newContent,
          });
        }
        // Update cursor position
        const cursor = update.state.selection.main.head;
        const line = update.state.doc.lineAt(cursor);
        updateTab(tabId, {
          cursorLine: line.number,
          cursorCol: cursor - line.from + 1,
        });
      }),
    ];

    if (languageExt) extensions.push(languageExt);

    const view = new EditorView({
      state: CMState.create({ doc: content, extensions }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create on mount — settings changes are handled via compartments below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Reconfigure word wrap
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(
        settings.wordWrap ? EditorView.lineWrapping : []
      ),
    });
  }, [settings.wordWrap]);

  // Reconfigure font size
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: fontCompartment.current.reconfigure(
        EditorView.theme({
          "&": { fontSize: `${settings.fontSize}px` },
          ".cm-gutters": { fontSize: `${settings.fontSize}px` },
        })
      ),
    });
  }, [settings.fontSize]);

  // Reconfigure indent
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indentCompartment.current.reconfigure(
        indentUnit.of(" ".repeat(settings.indentSize))
      ),
    });
  }, [settings.indentSize]);

  // Ctrl+F opens search panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && viewRef.current) {
        e.preventDefault();
        openSearchPanel(viewRef.current);
      }
      // Ctrl+/- for font size
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        store.getState().updateSettings({ fontSize: Math.min(28, settings.fontSize + 1) });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        store.getState().updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings.fontSize, store]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    />
  );
}
```

**Step 5: Commit**

```bash
git add apps/ui/src/features/editor/components/
git commit -m "feat(editor): create EditorTabBar, EditorToolbar, EditorStatusBar, EditorPane components"
```

---

### Task 10: Create EditorApp Root Component

**Files:**
- Create: `apps/ui/src/features/editor/EditorApp.tsx`

**Step 1: Create EditorApp**

Create `apps/ui/src/features/editor/EditorApp.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { createEditorStore } from "./stores/editorStore";
import { EditorTabBar } from "./components/EditorTabBar";
import { EditorToolbar } from "./components/EditorToolbar";
import { EditorPane } from "./components/EditorPane";
import { EditorStatusBar } from "./components/EditorStatusBar";
import { getLanguageName } from "../sftp/utils/languageDetect";

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface EditorAppProps {
  sftpSessionId: string;
}

export function EditorApp({ sftpSessionId }: EditorAppProps) {
  const store = useMemo(() => createEditorStore(sftpSessionId), [sftpSessionId]);
  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const sessionDisconnected = useStore(store, (s) => s.sessionDisconnected);
  const [saving, setSaving] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Open a file: download content, create tab
  const openFile = useCallback(
    async (remotePath: string) => {
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const fileName = remotePath.split("/").pop() ?? remotePath;
      const language = getLanguageName(fileName);

      // Add loading tab immediately
      store.getState().addTab({
        id: tabId,
        remotePath,
        fileName,
        content: "",
        originalContent: "",
        dirty: false,
        loading: true,
        error: null,
        language,
      });

      try {
        const response = await window.sshterm?.sftpReadFile?.({
          sftpSessionId,
          path: remotePath,
        });

        if (!response) {
          store.getState().updateTab(tabId, {
            loading: false,
            error: "Failed to read file",
          });
          return;
        }

        const content =
          response.encoding === "base64"
            ? decodeBase64Utf8(response.content)
            : response.content;

        store.getState().updateTab(tabId, {
          loading: false,
          content,
          originalContent: content,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load file";
        store.getState().updateTab(tabId, { loading: false, error: message });
      }
    },
    [sftpSessionId, store]
  );

  // Listen for open-file events from main process
  useEffect(() => {
    return window.sshterm?.onEditorOpenFile?.((event) => {
      void openFile(event.remotePath);
    });
  }, [openFile]);

  // Listen for session-closed events
  useEffect(() => {
    return window.sshterm?.onEditorSessionClosed?.(() => {
      store.getState().setSessionDisconnected();
    });
  }, [store]);

  // Save current file
  const handleSave = useCallback(async () => {
    if (!activeTab || sessionDisconnected) return;

    setSaving(true);
    try {
      await window.sshterm?.sftpWriteFile?.({
        sftpSessionId,
        path: activeTab.remotePath,
        content: activeTab.content,
        encoding: "utf-8",
      });
      store.getState().updateTab(activeTab.id, {
        originalContent: activeTab.content,
        dirty: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save file";
      store.getState().updateTab(activeTab.id, { error: message });
    } finally {
      setSaving(false);
    }
  }, [activeTab, sessionDisconnected, sftpSessionId, store]);

  // Close tab with unsaved changes prompt
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = store.getState().tabs.find((t) => t.id === tabId);
      if (tab?.dirty && !window.confirm(`"${tab.fileName}" has unsaved changes. Close anyway?`)) {
        return;
      }
      store.getState().removeTab(tabId);

      // Close window if no tabs left
      if (store.getState().tabs.length === 0) {
        window.close();
      }
    },
    [store]
  );

  // Ctrl+S to save, Ctrl+W to close tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleCloseTab, activeTabId]);

  // Warn on close if dirty tabs
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDirty = store.getState().tabs.some((t) => t.dirty);
      if (hasDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [store]);

  return (
    <div className="flex h-screen flex-col bg-base-900 text-text-primary">
      {sessionDisconnected && (
        <div className="bg-red-900/60 px-3 py-1.5 text-center text-xs text-red-200">
          SFTP session disconnected. Save is disabled.
        </div>
      )}

      <EditorTabBar store={store} onCloseTab={handleCloseTab} />

      <EditorToolbar
        store={store}
        onSave={() => void handleSave()}
        saving={saving}
        disabled={sessionDisconnected}
      />

      <div className="relative flex-1 overflow-hidden">
        {activeTab ? (
          activeTab.loading ? (
            <div className="flex h-full items-center justify-center text-text-secondary">
              Loading {activeTab.fileName}...
            </div>
          ) : (
            <EditorPane
              key={activeTab.id}
              store={store}
              tabId={activeTab.id}
              content={activeTab.content}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            No files open
          </div>
        )}
      </div>

      <EditorStatusBar store={store} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/ui/src/features/editor/EditorApp.tsx
git commit -m "feat(editor): create EditorApp root component with tab management and file I/O"
```

---

### Task 11: Wire EditorApp into App.tsx Entry Point

**Files:**
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Add conditional render for editor window**

At the top of `apps/ui/src/app/App.tsx`, add the import (after line 1):

```typescript
import { EditorApp } from "../features/editor/EditorApp";
```

Then, before the `export function App()` declaration (before line 201), add a wrapper component:

```typescript
function AppRoot() {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");
  const sftpSessionId = params.get("sftpSessionId");

  if (windowType === "editor" && sftpSessionId) {
    return <EditorApp sftpSessionId={sftpSessionId} />;
  }

  return <App />;
}
```

Then update the export at the very bottom. The current `App` should stay as-is, but the **default export or root mount** should use `AppRoot`. Check `apps/ui/src/main.tsx` (or equivalent entry point) to see what is imported and rendered — update that to render `AppRoot` instead of `App` if they import `App` directly.

Alternatively, if the existing `App` is what gets mounted, refactor by:
1. Rename the current `export function App()` to `function MainApp()`
2. Create:
```typescript
export function App() {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");
  const sftpSessionId = params.get("sftpSessionId");

  if (windowType === "editor" && sftpSessionId) {
    return <EditorApp sftpSessionId={sftpSessionId} />;
  }

  return <MainApp />;
}
```

This avoids changing the import in main.tsx.

**Step 2: Build to verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/ui/src/app/App.tsx
git commit -m "feat(editor): wire EditorApp into App.tsx with query param routing"
```

---

### Task 12: Wire SFTP "Edit" Button to Open Editor Window

**Files:**
- Modify: `apps/ui/src/features/sftp/SftpTab.tsx` (replace inline RemoteEditor with IPC call)
- Modify: `apps/ui/src/features/sftp/components/RemotePane.tsx` (no changes needed if `onEdit` prop stays same)

**Step 1: Update SftpTab to use editor window IPC**

In `apps/ui/src/features/sftp/SftpTab.tsx`:

1. Remove the `RemoteEditor` import (line 9):
```typescript
// DELETE: import { RemoteEditor } from "./components/RemoteEditor";
```

2. Remove the `editingFile` state (line 63):
```typescript
// DELETE: const [editingFile, setEditingFile] = useState<string | null>(null);
```

3. Replace the `onEdit={setEditingFile}` prop on `SftpDualPane` (line 361) with:
```typescript
onEdit={(remotePath: string) => {
  void window.sshterm?.editorOpen?.({ sftpSessionId, remotePath });
}}
```

4. Remove the entire `{editingFile && (<RemoteEditor .../>)}` block (lines 381-387).

**Step 2: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/ui/src/features/sftp/SftpTab.tsx
git commit -m "feat(sftp): wire edit button to open editor in separate window"
```

---

### Task 13: Handle Renderer URL for Editor Window (File Protocol)

**Files:**
- Modify: `apps/desktop/src/main/windows/createEditorWindow.ts`

The `rendererUrl` may be a `file://` URL (bundled build) or `http://localhost:5173` (dev). For `file://` URLs, we can't just append query params to `index.html` — we need to use a hash or the search component of the URL.

**Step 1: Fix URL construction for both file:// and http:// protocols**

Update `createEditorWindow.ts` to properly handle both URL types:

```typescript
  // Build editor URL — handle both file:// (production) and http:// (dev)
  const url = new URL(rendererUrl);
  url.searchParams.set("window", "editor");
  url.searchParams.set("sftpSessionId", sftpSessionId);
  void win.loadURL(url.toString());
```

Replace the existing naive string concatenation with this URL-based approach.

**Step 2: Verify that file:// URLs with search params work in Electron**

Electron's `loadURL` supports `file://path/to/index.html?param=value`. The renderer can read these via `window.location.search`. This should work but test it.

**Step 3: Commit**

```bash
git add apps/desktop/src/main/windows/createEditorWindow.ts
git commit -m "fix(editor): handle file:// and http:// URLs for editor window"
```

---

### Task 14: End-to-End Testing

**Step 1: Build all packages**

Run: `pnpm build`
Expected: No errors.

**Step 2: Run unit tests**

Run: `pnpm test`
Expected: All existing tests pass.

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No new lint errors.

**Step 4: Manual testing checklist**

1. Start the app in dev mode
2. Connect to an SFTP host
3. Right-click a file → Edit
4. Verify: a new Electron window opens with the file content
5. Verify: syntax highlighting works for the file type
6. Verify: status bar shows line/col, language, encoding
7. Verify: word wrap toggle works
8. Verify: font size +/- works (toolbar and Ctrl+/-)
9. Verify: indent size dropdown changes indent unit
10. Verify: Ctrl+S saves the file
11. Verify: Ctrl+F opens search panel
12. Verify: dirty indicator (yellow dot) appears on edit
13. Verify: editing another file opens a new tab in the same editor window
14. Verify: closing a dirty tab prompts for confirmation
15. Verify: disconnecting the SFTP session shows "Disconnected" banner and disables save
16. Verify: Ctrl+W closes the active tab
17. Verify: closing the last tab closes the editor window

**Step 5: Fix any issues found during testing**

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(editor): full-featured SFTP file editor in separate window"
```
