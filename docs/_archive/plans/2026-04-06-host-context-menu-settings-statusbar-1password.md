# Host Context Menu, Settings, Status Bar & 1Password Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform host list click behavior (single-click = connect, right-click = context menu), add a settings panel with font/theme controls, build a colorful session status bar, and wire up 1Password SSH agent integration in the UI.

**Architecture:** The host list in `SidebarHostList` changes from onClick=edit/onDoubleClick=connect to onClick=connect with a reusable `ContextMenu` component for right-click actions. Settings are stored via the existing `settings:get`/`settings:update` IPC and a new Zustand `settingsStore`. The status bar is a new component rendered at the bottom of `AppShell`. 1Password integration extends the existing `opResolver.ts` and auth schemas with a UI selector in the host form.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS v4, xterm.js 6, Zod, existing IPC infrastructure, 1Password CLI (`op`)

---

## Task 1: Reusable ContextMenu Component

**Files:**
- Create: `apps/ui/src/components/ContextMenu.tsx`
- Reference: `apps/ui/src/features/sftp/components/FileContextMenu.tsx`

**Step 1: Create the ContextMenu component**

This is a generalized version of `FileContextMenu` that supports icons and keyboard shortcuts display.

```tsx
// apps/ui/src/components/ContextMenu.tsx
import { useEffect, useRef } from "react";

export interface ContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (actions.length === 0) return null;

  // Clamp position so menu doesn't overflow viewport
  const menuWidth = 220;
  const menuHeight = actions.length * 32;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-border bg-base-800/95 py-1 shadow-xl shadow-black/30 backdrop-blur"
      style={{ left: clampedX, top: clampedY }}
    >
      {actions.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} className="my-1 border-t border-border/70" />
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-text-primary hover:bg-base-700/80"
            }`}
          >
            {item.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center text-text-muted">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-[10px] text-text-muted ml-2">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add apps/ui/src/components/ContextMenu.tsx
git commit -m "feat: add reusable ContextMenu component"
```

---

## Task 2: Host List — Single-Click to Connect + Right-Click Context Menu

**Files:**
- Modify: `apps/ui/src/features/sidebar/SidebarHostList.tsx`
- Modify: `apps/ui/src/features/sidebar/Sidebar.tsx`
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Update SidebarHostList props and add context menu state**

The component needs new callback props for all context menu actions. Change `onClick` from `onEdit` to `onConnect`, remove `onDoubleClick`, and add `onContextMenu`.

```tsx
// apps/ui/src/features/sidebar/SidebarHostList.tsx
import { useState } from "react";
import { ContextMenu, type ContextMenuAction } from "../../components/ContextMenu";
import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  onConnect: (host: HostRecord) => void;
  onOpenSftp: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
  onDuplicate: (host: HostRecord) => void;
  onDelete: (host: HostRecord) => void;
  onToggleFavorite: (host: HostRecord) => void;
  onCopyHostname: (host: HostRecord) => void;
  onCopyAddress: (host: HostRecord) => void;
}

export function SidebarHostList({
  hosts,
  onConnect,
  onOpenSftp,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onCopyHostname,
  onCopyAddress,
}: SidebarHostListProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    host: HostRecord;
  } | null>(null);

  const grouped = new Map<string, HostRecord[]>();
  for (const host of hosts) {
    const group = host.group || "Ungrouped";
    const list = grouped.get(group) ?? [];
    list.push(host);
    grouped.set(group, list);
  }

  const buildContextActions = (host: HostRecord): ContextMenuAction[] => [
    {
      label: "Connect",
      action: () => onConnect(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L12 8L6 12" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: "Add to Favorites",
      action: () => onToggleFavorite(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L9.8 6.2L14 6.6L10.9 9.4L11.8 14L8 11.6L4.2 14L5.1 9.4L2 6.6L6.2 6.2L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "Edit Host",
      action: () => onEdit(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      label: "Copy Hostname",
      action: () => onCopyHostname(host),
    },
    {
      label: "Copy IP Address",
      action: () => onCopyAddress(host),
    },
    {
      label: "Duplicate",
      action: () => onDuplicate(host),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "SFTP Browser",
      action: () => onOpenSftp(host),
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 4H7L8.5 2H14V13H2V4Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ),
    },
    { label: "", action: () => {}, separator: true },
    {
      label: "Delete",
      action: () => onDelete(host),
      danger: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 4H13M6 4V3H10V4M5 4V13H11V4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-0.5 px-1">
      {[...grouped.entries()].map(([group, groupHosts]) => (
        <div key={group}>
          <div className="select-none px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-text-muted/70">
            {group}
          </div>

          {groupHosts.map((host) => (
            <div key={host.id} className="group flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={() => onConnect(host)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, host });
                }}
                className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 text-left text-sm transition-all duration-150 hover:border-accent/50 hover:bg-base-700/60"
                title={`${host.hostname}:${host.port} — click to connect`}
              >
                <span className="relative flex shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-text-muted/60 transition-colors duration-200 group-hover:bg-success" />
                  <span className="absolute inset-0 h-2 w-2 rounded-full bg-success/0 blur-[3px] transition-all duration-200 group-hover:bg-success/30" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium leading-tight text-text-primary">
                    {host.name}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] leading-tight text-text-muted">
                    {host.username}@{host.hostname}:{host.port}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      ))}

      {hosts.length === 0 && (
        <div className="px-2 py-6 text-center text-xs text-text-muted">No hosts yet</div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={buildContextActions(contextMenu.host)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

**Step 2: Update Sidebar props to pass through new callbacks**

Add new props to `SidebarProps` and pass them through to `SidebarHostList`:

```tsx
// In Sidebar.tsx, add to SidebarProps:
  onDuplicateHost: (host: HostRecord) => void;
  onDeleteHost: (host: HostRecord) => void;
  onToggleFavoriteHost: (host: HostRecord) => void;

// Pass to SidebarHostList:
<SidebarHostList
  hosts={hosts}
  onConnect={onConnectHost}
  onOpenSftp={onOpenSftpHost}
  onEdit={onEditHost}
  onDuplicate={onDuplicateHost}
  onDelete={onDeleteHost}
  onToggleFavorite={onToggleFavoriteHost}
  onCopyHostname={(host) => navigator.clipboard.writeText(host.hostname)}
  onCopyAddress={(host) => navigator.clipboard.writeText(host.hostname)}
/>
```

**Step 3: Update App.tsx to implement the new callbacks**

Add handler functions in `App.tsx`:

```tsx
// In App.tsx, add these callbacks:

const duplicateHost = useCallback(
  (host: HostRecord) => {
    const newHost: HostRecord = {
      ...host,
      id: `host-${Date.now()}`,
      name: `${host.name} (copy)`,
    };
    setHosts((prev) => [...prev, newHost]);
    void persistHost(newHost);
  },
  []
);

const deleteHost = useCallback(
  async (host: HostRecord) => {
    setHosts((prev) => prev.filter((h) => h.id !== host.id));
    await window.sshterm?.removeHost?.({ id: host.id });
  },
  []
);

const toggleFavoriteHost = useCallback(
  (_host: HostRecord) => {
    // TODO: Implement favorites system with settings store
    console.log("[sshterm] toggle favorite — not yet implemented");
  },
  []
);

// Update <Sidebar> props:
<Sidebar
  hosts={hosts}
  onConnectHost={connectHost}
  onOpenSftpHost={openSftpHost}
  onEditHost={(host) => { setEditingHost(host); setHostModalOpen(true); }}
  onNewHost={() => { setEditingHost(null); setHostModalOpen(true); }}
  onImportSshConfig={() => setImportModalOpen(true)}
  onDuplicateHost={duplicateHost}
  onDeleteHost={deleteHost}
  onToggleFavoriteHost={toggleFavoriteHost}
  serialProfiles={serialProfiles}
  onConnectSerial={connectSerial}
  onEditSerial={(profile) => { setEditingSerial(profile); setSerialModalOpen(true); }}
  onNewSerial={() => { setEditingSerial(null); setSerialModalOpen(true); refreshPorts(); }}
/>
```

**Step 4: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add apps/ui/src/features/sidebar/SidebarHostList.tsx apps/ui/src/features/sidebar/Sidebar.tsx apps/ui/src/app/App.tsx
git commit -m "feat: single-click connect + right-click context menu on host list"
```

---

## Task 3: Settings Store (Zustand)

**Files:**
- Create: `apps/ui/src/features/settings/settingsStore.ts`

**Step 1: Create the settings store**

This store loads settings from the backend IPC and caches them in memory. It provides typed getters for known setting keys.

```tsx
// apps/ui/src/features/settings/settingsStore.ts
import { createStore } from "zustand/vanilla";

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorBlink: boolean;
  scrollback: number;
  theme: string; // theme preset name
}

export interface AppSettings {
  terminal: TerminalSettings;
}

const defaultSettings: AppSettings = {
  terminal: {
    fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    scrollback: 5000,
    theme: "default",
  },
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  updateTerminal: (partial: Partial<TerminalSettings>) => Promise<void>;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const result = await window.sshterm?.getSetting?.({ key });
    return result?.value ?? null;
  } catch {
    return null;
  }
}

async function saveSetting(key: string, value: string): Promise<void> {
  try {
    await window.sshterm?.updateSetting?.({ key, value });
  } catch (err) {
    console.error("[settings] failed to save", key, err);
  }
}

export const settingsStore = createStore<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,

  load: async () => {
    const raw = await getSetting("app.settings");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        set({
          settings: {
            terminal: { ...defaultSettings.terminal, ...parsed.terminal },
          },
          loaded: true,
        });
        return;
      } catch {
        // ignore parse errors, use defaults
      }
    }
    set({ loaded: true });
  },

  updateTerminal: async (partial) => {
    const current = get().settings;
    const next: AppSettings = {
      ...current,
      terminal: { ...current.terminal, ...partial },
    };
    set({ settings: next });
    await saveSetting("app.settings", JSON.stringify(next));
  },
}));
```

**Step 2: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add apps/ui/src/features/settings/settingsStore.ts
git commit -m "feat: add Zustand settings store with terminal preferences"
```

---

## Task 4: Terminal Theme Presets

**Files:**
- Modify: `apps/ui/src/features/terminal/terminalTheme.ts`

**Step 1: Add theme presets**

Extend the existing `terminalTheme.ts` to export multiple named presets:

```tsx
// Add to terminalTheme.ts, after the existing terminalTheme:

export const terminalThemes: Record<string, typeof terminalTheme> = {
  default: terminalTheme,
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#282a36",
    selectionBackground: "rgba(68, 71, 90, 0.5)",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#272822",
    selectionBackground: "rgba(73, 72, 62, 0.5)",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5",
  },
  solarizedDark: {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#839496",
    cursorAccent: "#002b36",
    selectionBackground: "rgba(7, 54, 66, 0.5)",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    cursorAccent: "#2e3440",
    selectionBackground: "rgba(67, 76, 94, 0.5)",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
  tokyoNight: {
    background: "#1a1b26",
    foreground: "#a9b1d6",
    cursor: "#c0caf5",
    cursorAccent: "#1a1b26",
    selectionBackground: "rgba(51, 59, 91, 0.5)",
    black: "#15161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#414868",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
};

export function getTerminalOptions(settings?: {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  cursorBlink?: boolean;
  scrollback?: number;
  theme?: string;
}): typeof terminalOptions {
  const themePreset = terminalThemes[settings?.theme ?? "default"] ?? terminalTheme;
  return {
    ...terminalOptions,
    fontFamily: settings?.fontFamily ?? terminalOptions.fontFamily,
    fontSize: settings?.fontSize ?? terminalOptions.fontSize,
    lineHeight: settings?.lineHeight ?? terminalOptions.lineHeight,
    cursorBlink: settings?.cursorBlink ?? terminalOptions.cursorBlink,
    scrollback: settings?.scrollback ?? terminalOptions.scrollback,
    theme: themePreset,
  };
}
```

**Step 2: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add apps/ui/src/features/terminal/terminalTheme.ts
git commit -m "feat: add terminal theme presets (dracula, monokai, solarized, nord, tokyo night)"
```

---

## Task 5: Settings Panel UI

**Files:**
- Create: `apps/ui/src/features/settings/SettingsPanel.tsx`
- Modify: `apps/ui/src/features/sidebar/Sidebar.tsx`
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Create the SettingsPanel component**

```tsx
// apps/ui/src/features/settings/SettingsPanel.tsx
import { useStore } from "zustand";
import { settingsStore } from "./settingsStore";
import { terminalThemes } from "../terminal/terminalTheme";

const fontOptions = [
  '"IBM Plex Mono", monospace',
  '"JetBrains Mono", monospace',
  '"Fira Code", monospace',
  '"Cascadia Code", monospace',
  '"Source Code Pro", monospace',
  'Consolas, monospace',
  '"Courier New", monospace',
];

const fontSizeOptions = [10, 11, 12, 13, 14, 15, 16, 18, 20];

const selectClass =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 hover:border-border-bright appearance-none cursor-pointer";

const inputClass =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 hover:border-border-bright";

export function SettingsPanel() {
  const terminal = useStore(settingsStore, (s) => s.settings.terminal);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);

  return (
    <div className="grid gap-6 max-w-lg">
      {/* Font Settings */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
            <path d="M3 13L8 3L13 13M5 9H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Font
        </h3>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Font Family</span>
            <select
              value={terminal.fontFamily}
              onChange={(e) => updateTerminal({ fontFamily: e.target.value })}
              className={selectClass}
            >
              {fontOptions.map((font) => (
                <option key={font} value={font}>
                  {font.split(",")[0].replace(/"/g, "")}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Font Size</span>
              <select
                value={terminal.fontSize}
                onChange={(e) => updateTerminal({ fontSize: Number(e.target.value) })}
                className={selectClass}
              >
                {fontSizeOptions.map((size) => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Line Height</span>
              <input
                type="number"
                value={terminal.lineHeight}
                min={1}
                max={2}
                step={0.1}
                onChange={(e) => updateTerminal({ lineHeight: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
          </div>
        </div>
      </section>

      {/* Terminal Theme */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 2.5V8L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Theme
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(terminalThemes).map(([name, theme]) => (
            <button
              key={name}
              type="button"
              onClick={() => updateTerminal({ theme: name })}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                terminal.theme === name
                  ? "border-accent/40 bg-accent/10 text-text-primary"
                  : "border-border bg-surface/80 text-text-secondary hover:border-border-bright hover:text-text-primary"
              }`}
            >
              {/* Color swatch */}
              <div className="flex gap-0.5 shrink-0">
                {[theme.red, theme.green, theme.blue, theme.yellow].map((color, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="capitalize truncate">{name === "solarizedDark" ? "Solarized" : name === "tokyoNight" ? "Tokyo Night" : name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Terminal Behavior */}
      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
            <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7L7 9L5 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 11H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Behavior
        </h3>
        <div className="grid gap-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/80 px-3 py-2.5">
            <span className="text-sm text-text-secondary">Cursor Blink</span>
            <button
              type="button"
              onClick={() => updateTerminal({ cursorBlink: !terminal.cursorBlink })}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                terminal.cursorBlink ? "bg-accent" : "bg-base-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  terminal.cursorBlink ? "translate-x-4" : ""
                }`}
              />
            </button>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Scrollback Lines</span>
            <select
              value={terminal.scrollback}
              onChange={(e) => updateTerminal({ scrollback: Number(e.target.value) })}
              className={selectClass}
            >
              {[1000, 2000, 5000, 10000, 25000, 50000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString()}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Add settings button to Sidebar footer**

In `Sidebar.tsx`, add a settings gear icon button next to the version text:

```tsx
// In Sidebar.tsx, update the footer div:
<div className="mt-auto border-t border-border px-3 py-2 flex items-center justify-between">
  <div className="text-[10px] text-text-muted/60 tracking-wide select-none">SSHTerm v0.1.0</div>
  <button
    type="button"
    onClick={onOpenSettings}
    className="p-1 rounded text-text-muted hover:text-accent/80 hover:bg-accent/[0.06] transition-all duration-150"
    title="Settings"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3 3L4.5 4.5M11.5 11.5L13 13M13 3L11.5 4.5M4.5 11.5L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  </button>
</div>
```

Add `onOpenSettings: () => void;` to `SidebarProps`.

**Step 3: Wire up settings modal in App.tsx**

Add state and modal in `App.tsx`:

```tsx
// Add state:
const [settingsOpen, setSettingsOpen] = useState(false);

// Load settings on mount (in the existing useEffect or a new one):
useEffect(() => {
  void settingsStore.getState().load();
}, []);

// Add to Sidebar:
onOpenSettings={() => setSettingsOpen(true)}

// Add modal:
<Modal
  open={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  title="Settings"
>
  <SettingsPanel />
</Modal>
```

**Step 4: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add apps/ui/src/features/settings/SettingsPanel.tsx apps/ui/src/features/sidebar/Sidebar.tsx apps/ui/src/app/App.tsx
git commit -m "feat: add settings panel with font, theme, and terminal behavior settings"
```

---

## Task 6: Apply Settings to Terminal

**Files:**
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts`

**Step 1: Read useTerminalSession.ts to understand terminal init**

Read: `apps/ui/src/features/terminal/useTerminalSession.ts`

**Step 2: Update terminal initialization to use settings**

Where the terminal instance is created (the `new Terminal(terminalOptions)` call), replace it with:

```tsx
import { useStore } from "zustand";
import { settingsStore } from "../settings/settingsStore";
import { getTerminalOptions } from "./terminalTheme";

// Inside the hook, get settings:
const terminalSettings = useStore(settingsStore, (s) => s.settings.terminal);

// When creating terminal instance:
const opts = getTerminalOptions(terminalSettings);
const instance = new Terminal(opts);
```

Also subscribe to settings changes to update live terminals:

```tsx
// After terminal is created and opened, add effect to update theme/font:
useEffect(() => {
  if (!termRef.current) return;
  const opts = getTerminalOptions(terminalSettings);
  const term = termRef.current;
  term.options.fontFamily = opts.fontFamily;
  term.options.fontSize = opts.fontSize;
  term.options.lineHeight = opts.lineHeight;
  term.options.cursorBlink = opts.cursorBlink;
  term.options.scrollback = opts.scrollback;
  term.options.theme = opts.theme;
  // Re-fit after font change
  fit();
}, [terminalSettings, fit]);
```

**Step 3: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add apps/ui/src/features/terminal/useTerminalSession.ts
git commit -m "feat: apply settings store to terminal instances with live updates"
```

---

## Task 7: Status Bar Component

**Files:**
- Create: `apps/ui/src/features/statusbar/StatusBar.tsx`
- Create: `apps/ui/src/features/statusbar/useSessionStats.ts`
- Modify: `apps/ui/src/features/layout/AppShell.tsx`

**Step 1: Create the session stats hook**

This hook tracks connection time and periodically pings for latency. CPU/mem/disk/uptime are obtained by running remote commands over the SSH session.

```tsx
// apps/ui/src/features/statusbar/useSessionStats.ts
import { useEffect, useRef, useState } from "react";

export interface SessionStats {
  connectionTime: number | null; // seconds since connected
  latency: number | null; // ms
  uptime: string | null;
  cpuUsage: string | null;
  memUsage: string | null;
  diskUsage: string | null;
}

export function useSessionStats(
  sessionId: string | null,
  sessionState: string | null
): SessionStats {
  const [stats, setStats] = useState<SessionStats>({
    connectionTime: null,
    latency: null,
    uptime: null,
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
  });
  const connectedAt = useRef<number | null>(null);

  // Track connection time
  useEffect(() => {
    if (sessionState === "connected") {
      connectedAt.current = Date.now();
    } else {
      connectedAt.current = null;
    }
  }, [sessionState]);

  // Update connection timer every second
  useEffect(() => {
    if (sessionState !== "connected") {
      setStats((s) => ({ ...s, connectionTime: null }));
      return;
    }

    const interval = setInterval(() => {
      if (connectedAt.current) {
        setStats((s) => ({
          ...s,
          connectionTime: Math.floor((Date.now() - connectedAt.current!) / 1000),
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState]);

  return stats;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
```

**Step 2: Create the StatusBar component**

```tsx
// apps/ui/src/features/statusbar/StatusBar.tsx
import { useStore } from "zustand";
import { layoutStore } from "../layout/layoutStore";
import { useSessionStats, formatDuration } from "./useSessionStats";

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  color?: string;
}

function StatusItem({ icon, label, value, color = "text-text-secondary" }: StatusItemProps) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className={`w-3.5 h-3.5 flex items-center justify-center ${color}`}>{icon}</span>
      <span className="text-text-secondary text-[11px]">{value}</span>
    </div>
  );
}

export function StatusBar() {
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeTab = tabs.find((t) => t.sessionId === activeSessionId);

  // For now, session state is not directly available in the store.
  // We use a simple "connected" assumption when a tab exists.
  const sessionState = activeTab ? "connected" : null;
  const stats = useSessionStats(activeSessionId, sessionState);

  return (
    <div className="flex items-center justify-between h-6 px-3 border-t border-border bg-base-800/80 shrink-0 select-none">
      {/* Left side: session info */}
      <div className="flex items-center gap-3">
        {activeTab ? (
          <>
            {/* Connection indicator */}
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-[11px] text-text-primary font-medium truncate max-w-[150px]">
                {activeTab.title}
              </span>
            </div>

            {/* Transport badge */}
            <span className="text-[10px] uppercase tracking-wider text-text-muted bg-base-700/60 px-1.5 py-0.5 rounded">
              {activeTab.transport ?? "ssh"}
            </span>

            {/* Connection time */}
            {stats.connectionTime !== null && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M8 5V8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                }
                label="Connection time"
                value={formatDuration(stats.connectionTime)}
                color="text-accent"
              />
            )}

            {/* Latency */}
            {stats.latency !== null && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M2 12L5 6L8 9L11 3L14 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
                label="Latency"
                value={`${stats.latency}ms`}
                color="text-success"
              />
            )}

            {/* CPU */}
            {stats.cpuUsage && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 1V4M10 1V4M6 12V15M10 12V15M1 6H4M1 10H4M12 6H15M12 10H15" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                }
                label="CPU"
                value={stats.cpuUsage}
                color="text-warning"
              />
            )}

            {/* Memory */}
            {stats.memUsage && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 5H10M6 8H10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                }
                label="Memory"
                value={stats.memUsage}
                color="text-magenta"
              />
            )}

            {/* Disk */}
            {stats.diskUsage && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <ellipse cx="8" cy="11" rx="5" ry="2" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M3 5V11M13 5V11" stroke="currentColor" strokeWidth="1.3" />
                    <ellipse cx="8" cy="5" rx="5" ry="2" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                }
                label="Disk"
                value={stats.diskUsage}
                color="text-cyan-400"
              />
            )}

            {/* Uptime */}
            {stats.uptime && (
              <StatusItem
                icon={
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2V8H12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                }
                label="Uptime"
                value={stats.uptime}
                color="text-success"
              />
            )}
          </>
        ) : (
          <span className="text-[11px] text-text-muted">No active session</span>
        )}
      </div>

      {/* Right side: tab count */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted">
          {tabs.length} session{tabs.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Add StatusBar to AppShell**

In `AppShell.tsx`, add the status bar at the bottom of the main content area:

```tsx
// Import at top:
import { StatusBar } from "../statusbar/StatusBar";

// In the return, wrap <main> content:
<main className="flex-1 flex flex-col min-w-0 bg-base-900">
  <div className="flex-1 flex flex-col min-h-0">
    {children}
  </div>
  <StatusBar />
</main>
```

**Step 4: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add apps/ui/src/features/statusbar/StatusBar.tsx apps/ui/src/features/statusbar/useSessionStats.ts apps/ui/src/features/layout/AppShell.tsx
git commit -m "feat: add colorful session status bar with connection time and stats"
```

---

## Task 8: Expose Session State to StatusBar

**Files:**
- Create: `apps/ui/src/features/sessions/sessionStateStore.ts`
- Modify: `apps/ui/src/features/terminal/useTerminalSession.ts`
- Modify: `apps/ui/src/features/statusbar/StatusBar.tsx`

**Step 1: Create a session state store**

This store tracks the live state of each session so the StatusBar can read it.

```tsx
// apps/ui/src/features/sessions/sessionStateStore.ts
import { createStore } from "zustand/vanilla";

interface SessionStateEntry {
  state: string; // "connecting" | "connected" | "disconnected" | "failed"
  connectedAt: number | null;
}

interface SessionStateStore {
  sessions: Record<string, SessionStateEntry>;
  setSessionState: (sessionId: string, state: string) => void;
  removeSession: (sessionId: string) => void;
}

export const sessionStateStore = createStore<SessionStateStore>((set) => ({
  sessions: {},
  setSessionState: (sessionId, state) =>
    set((prev) => ({
      sessions: {
        ...prev.sessions,
        [sessionId]: {
          state,
          connectedAt:
            state === "connected"
              ? prev.sessions[sessionId]?.connectedAt ?? Date.now()
              : prev.sessions[sessionId]?.connectedAt ?? null,
        },
      },
    })),
  removeSession: (sessionId) =>
    set((prev) => {
      const { [sessionId]: _, ...rest } = prev.sessions;
      return { sessions: rest };
    }),
}));
```

**Step 2: Update useTerminalSession to publish state changes**

In `useTerminalSession.ts`, whenever `session.state` changes, call:

```tsx
import { sessionStateStore } from "../sessions/sessionStateStore";

// When state changes (in the event handler or wherever state is set):
sessionStateStore.getState().setSessionState(sessionId, newState);
```

**Step 3: Update StatusBar to use sessionStateStore**

```tsx
import { sessionStateStore } from "../sessions/sessionStateStore";

// In StatusBar component:
const sessionStates = useStore(sessionStateStore, (s) => s.sessions);
const activeState = activeSessionId ? sessionStates[activeSessionId] : null;
const sessionState = activeState?.state ?? null;
const connectedAt = activeState?.connectedAt ?? null;
```

**Step 4: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add apps/ui/src/features/sessions/sessionStateStore.ts apps/ui/src/features/terminal/useTerminalSession.ts apps/ui/src/features/statusbar/StatusBar.tsx
git commit -m "feat: wire session state store to status bar for live connection tracking"
```

---

## Task 9: 1Password Integration — UI Auth Profile Selector

**Files:**
- Modify: `apps/ui/src/features/hosts/HostForm.tsx`
- Modify: `apps/ui/src/features/hosts/HostsView.tsx` (HostRecord type)

The backend already supports 1Password via `opResolver.ts` and `authSchemas.ts`. The UI needs to let users:
1. Select auth method: key file, password, SSH agent, 1Password
2. For 1Password: enter an `op://` reference URI
3. Select 1Password as the SSH agent kind

**Step 1: Read HostForm.tsx to understand current form fields**

Read: `apps/ui/src/features/hosts/HostForm.tsx`

**Step 2: Add auth method selector to HostForm**

Add a new "Authentication" section to the host form with a dropdown for auth method. When "1Password" is selected, show an `op://` reference input field. When "SSH Agent" is selected, show agent kind selector (system/pageant/1password).

```tsx
// Add to HostFormValue:
authMethod?: "default" | "password" | "keyfile" | "agent" | "op-reference";
agentKind?: "system" | "pageant" | "1password";
opReference?: string;

// Add to form JSX, after the identity file field:
<label className="grid gap-1.5">
  <span className="text-xs font-medium text-text-secondary">Authentication</span>
  <select
    value={value.authMethod ?? "default"}
    onChange={(e) => setValue({ ...value, authMethod: e.target.value as HostFormValue["authMethod"] })}
    className={selectClass}
  >
    <option value="default">Default (SSH config)</option>
    <option value="keyfile">Key File</option>
    <option value="agent">SSH Agent</option>
    <option value="op-reference">1Password Reference</option>
  </select>
</label>

{value.authMethod === "agent" && (
  <label className="grid gap-1.5">
    <span className="text-xs font-medium text-text-secondary">Agent Type</span>
    <select
      value={value.agentKind ?? "system"}
      onChange={(e) => setValue({ ...value, agentKind: e.target.value as HostFormValue["agentKind"] })}
      className={selectClass}
    >
      <option value="system">System SSH Agent</option>
      <option value="pageant">Pageant</option>
      <option value="1password">1Password SSH Agent</option>
    </select>
  </label>
)}

{value.authMethod === "op-reference" && (
  <label className="grid gap-1.5">
    <span className="text-xs font-medium text-text-secondary">1Password Reference</span>
    <input
      value={value.opReference ?? ""}
      onChange={(e) => setValue({ ...value, opReference: e.target.value })}
      placeholder="op://vault/item/field"
      className={inputClass}
    />
    <span className="text-[10px] text-text-muted">
      Use 1Password CLI reference format: op://vault/item/field
    </span>
  </label>
)}
```

**Step 3: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add apps/ui/src/features/hosts/HostForm.tsx
git commit -m "feat: add 1Password auth method selector to host form"
```

---

## Task 10: 1Password Integration — IPC Wiring

**Files:**
- Modify: `packages/shared/src/ipc/schemas.ts` (add auth fields to UpsertHostRequest)
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts` (use auth profile when resolving host)

**Step 1: Read current UpsertHostRequest schema**

Read: `packages/shared/src/ipc/schemas.ts` — find `upsertHostRequestSchema`

**Step 2: Add auth fields to UpsertHostRequest**

```tsx
// In schemas.ts, add optional auth fields to upsertHostRequestSchema:
export const upsertHostRequestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  hostname: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().nullable().optional(),
  identityFile: z.string().nullable().optional(),
  group: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().nullable().optional(),
  // New auth fields
  authMethod: z.enum(["default", "password", "keyfile", "agent", "op-reference"]).optional(),
  agentKind: z.enum(["system", "pageant", "1password"]).optional(),
  opReference: z.string().optional(),
});
```

**Step 3: Update host resolution in registerIpc.ts**

In the `resolveHostProfile` callback in `registerIpc.ts`, when the host has `authMethod === "op-reference"`, call `resolveOnePasswordReference` to get the credential before establishing the session. When `agentKind === "1password"`, configure the SSH agent socket path for 1Password's agent.

```tsx
// In registerIpc.ts, in the resolveHostProfile function:
if (host.authMethod === "op-reference" && host.opReference) {
  const { resolveOnePasswordReference } = await import("../security/opResolver");
  const secret = await resolveOnePasswordReference(host.opReference);
  // Use secret as password or passphrase depending on context
}

if (host.agentKind === "1password") {
  // 1Password SSH agent socket path on Windows:
  // \\.\pipe\openssh-ssh-agent (when 1Password agent is configured)
  profile.agentPath = "\\\\.\\pipe\\openssh-ssh-agent";
}
```

**Step 4: Build and verify**

Run: `pnpm build`
Expected: BUILD SUCCESS

**Step 5: Commit**

```bash
git add packages/shared/src/ipc/schemas.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: wire 1Password auth method through IPC to session resolution"
```

---

## Task 11: Database Migration — Add Auth Fields to Hosts Table

**Files:**
- Create: `packages/db/src/migrations/003_host_auth_fields.sql`
- Modify: `packages/db/src/repositories/hostsRepository.ts`

**Step 1: Create migration**

```sql
-- packages/db/src/migrations/003_host_auth_fields.sql
ALTER TABLE hosts ADD COLUMN auth_method TEXT DEFAULT 'default';
ALTER TABLE hosts ADD COLUMN agent_kind TEXT DEFAULT 'system';
ALTER TABLE hosts ADD COLUMN op_reference TEXT;
```

**Step 2: Update hosts repository to include new fields**

In `hostsRepository.ts`, update the `create` (INSERT/UPSERT) and `list`/`get` queries to include `auth_method`, `agent_kind`, and `op_reference`. Map them to camelCase in the TypeScript `HostRecord`.

**Step 3: Build and verify**

Run: `pnpm build`
Expected: BUILD SUCCESS

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/db/src/migrations/003_host_auth_fields.sql packages/db/src/repositories/hostsRepository.ts
git commit -m "feat: add auth_method, agent_kind, op_reference columns to hosts table"
```

---

## Task 12: Favorites System

**Files:**
- Create: `packages/db/src/migrations/004_favorites.sql`
- Modify: `packages/db/src/repositories/hostsRepository.ts`
- Modify: `apps/ui/src/features/sidebar/SidebarHostList.tsx`

**Step 1: Create migration**

```sql
-- packages/db/src/migrations/004_favorites.sql
ALTER TABLE hosts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
```

**Step 2: Update host repository**

Add `isFavorite: boolean` to `HostRecord`. Update queries. Add a `toggleFavorite(id: string)` method.

**Step 3: Update SidebarHostList to show favorites first**

Sort hosts so favorites appear at the top of each group. Add a star icon next to favorited hosts.

**Step 4: Wire up the toggleFavorite callback through IPC**

Update `App.tsx` `toggleFavoriteHost` to call `window.sshterm.upsertHost` with the toggled favorite status.

**Step 5: Build and verify**

Run: `pnpm build && pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/db/src/migrations/004_favorites.sql packages/db/src/repositories/hostsRepository.ts apps/ui/src/features/sidebar/SidebarHostList.tsx apps/ui/src/app/App.tsx
git commit -m "feat: add favorites system with star indicator and sort-to-top"
```

---

## Task 13: Keyboard Shortcut — Ctrl+, for Settings

**Files:**
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Add keyboard handler**

In the existing `useEffect` with `onKeyDown`, add:

```tsx
if (e.key === "," && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  setSettingsOpen(true);
}
```

**Step 2: Build and verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: BUILD SUCCESS

**Step 3: Commit**

```bash
git add apps/ui/src/app/App.tsx
git commit -m "feat: add Ctrl+, keyboard shortcut to open settings"
```

---

## Implementation Order

The tasks have these dependencies:
- **Task 1** (ContextMenu) → **Task 2** (Host list context menu)
- **Task 3** (Settings store) → **Task 4** (Theme presets) → **Task 5** (Settings panel) → **Task 6** (Apply to terminal) → **Task 13** (Shortcut)
- **Task 7** (StatusBar) → **Task 8** (Session state wiring)
- **Task 9** (1Password UI) → **Task 10** (IPC wiring) → **Task 11** (DB migration)
- **Task 2** (Context menu) → **Task 12** (Favorites)

Parallel tracks:
- Track A: Tasks 1 → 2 → 12
- Track B: Tasks 3 → 4 → 5 → 6 → 13
- Track C: Tasks 7 → 8
- Track D: Tasks 9 → 10 → 11

All tracks can be worked in parallel since they touch different files.
