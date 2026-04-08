# SFTP Editor Window — Design

## Problem

The current SFTP file editor renders as an `absolute inset-0` overlay inside `SftpTab`, causing blank page issues. Users need a proper, full-featured editor in a separate window.

## Decision

Open a real Electron `BrowserWindow` for editing remote files. The editor window supports multiple tabs (one window per SFTP session, each file as a tab) and is tied to the SFTP session lifetime.

## Architecture

The editor window loads the same Vite renderer app with a `?window=editor&sftpSessionId=<id>` query param. `App.tsx` detects this and renders `EditorApp` instead of the main workbench. This reuses the same preload bridge and avoids a second Vite entry point.

### Window Management (Main Process)

- `createEditorWindow()` spawns a child BrowserWindow (same preload, parent: mainWindow)
- `EditorWindowManager` tracks open editor windows keyed by SFTP session ID
- IPC channel `sftp:open-editor` — renderer requests main to open/focus editor window with a file
- IPC channel `sftp:editor-open-file` — main→editor, tells it to add a tab for a file
- On SFTP disconnect, `EditorWindowManager` sends `sftp:editor-session-closed` to close windows

### Editor UI Layout

```
┌─[file1.ts]─[file2.json]─[config.yml]──────────────────────┐
│ [Wrap] [Indent: 2] [Font: 14px]                    [Save] │
├────────────────────────────────────────────────────────┬────┤
│                                                        │mini│
│  CodeMirror editor                                     │map │
│                                                        │    │
├────────────────────────────────────────────────────────┴────┤
│ Ln 42, Col 17 │ UTF-8 │ TypeScript │ 2 spaces │ LF        │
└─────────────────────────────────────────────────────────────┘
```

### Components

- `EditorApp` — root for editor window, manages tab state via Zustand
- `EditorTabBar` — tabs with close buttons, dirty dots
- `EditorToolbar` — word wrap toggle, indent size dropdown, font size +/-
- `EditorPane` — CodeMirror instance per tab (lazy-mounted, preserves state on switch)
- `EditorStatusBar` — line:col, encoding, language mode, indent info
- Minimap via `@replit/codemirror-minimap`

### Features

| Feature | Implementation |
|---|---|
| Syntax highlighting | `languageDetect.ts` expanded with bash, sql, ini, toml, php, rust, go, java, c/cpp |
| Line numbers | `basicSetup` |
| Search & replace | `@codemirror/search` |
| Word wrap toggle | `EditorView.lineWrapping` in reconfigurable compartment |
| Font size | CSS variable + Ctrl+/- keybindings |
| Minimap | `@replit/codemirror-minimap` |
| Tab size / indent | `indentUnit` reconfigurable compartment |
| Status bar | `EditorView.updateListener` for cursor pos + doc stats |

### IPC Flow

```
[SFTP Tab] --sftp:open-editor--> [Main] --creates/focuses--> [Editor Window]
                                        --sftp:editor-open-file--> [Editor Renderer]
[Editor]   --sftpReadFile------> [Main]  (existing IPC)
[Editor]   --sftpWriteFile-----> [Main]  (existing IPC)
[Main]     --sftp:editor-session-closed--> [Editor]  (unsaved prompt + close)
```

### Session Lifecycle

- Editor windows are children of the main window
- `EditorWindowManager` listens for SFTP session disconnect
- On disconnect: editor shows "Session disconnected" banner, disables save, prompts for unsaved tabs
- Closing main window closes all editor windows

### New Packages

- `@replit/codemirror-minimap`
- `@codemirror/lang-php`, `@codemirror/lang-rust`, `@codemirror/lang-go`, `@codemirror/lang-java`, `@codemirror/lang-cpp`, `@codemirror/lang-sql`

### Files

**New:**
- `apps/desktop/src/main/windows/createEditorWindow.ts`
- `apps/desktop/src/main/windows/editorWindowManager.ts`
- `apps/desktop/src/main/ipc/editorIpc.ts`
- `apps/ui/src/features/editor/EditorApp.tsx`
- `apps/ui/src/features/editor/components/EditorTabBar.tsx`
- `apps/ui/src/features/editor/components/EditorToolbar.tsx`
- `apps/ui/src/features/editor/components/EditorPane.tsx`
- `apps/ui/src/features/editor/components/EditorStatusBar.tsx`
- `apps/ui/src/features/editor/stores/editorStore.ts`
- `packages/shared/src/ipc/editorChannels.ts`
- `packages/shared/src/ipc/editorSchemas.ts`

**Modified:**
- `apps/ui/src/app/App.tsx` — detect `?window=editor`, render `EditorApp`
- `apps/ui/src/features/sftp/utils/languageDetect.ts` — add languages
- `apps/desktop/src/main/ipc/registerIpc.ts` — register editor IPC
- `apps/desktop/src/main/ipc/sftpIpc.ts` — emit session-closed to editor windows
- `apps/desktop/src/preload/desktopApi.ts` — add editor IPC methods
- `apps/ui/src/types/global.d.ts` — editor types
- `apps/ui/src/features/sftp/components/RemotePane.tsx` — wire edit to open-editor IPC
- `apps/ui/src/features/sftp/SftpTab.tsx` — remove inline RemoteEditor overlay
