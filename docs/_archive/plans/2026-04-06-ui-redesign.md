# SSHTerm UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform SSHTerm from a prototype with inline styles and flat layout into a polished desktop app with Tailwind CSS, sidebar+workspace layout, and proper component organization.

**Architecture:** Replace the single scrollable Workbench page with a fixed-viewport shell: collapsible sidebar (hosts, serial profiles, actions) on the left, tabbed terminal workspace on the right. All inline styles replaced with Tailwind utility classes. Forms (HostForm, SshConfigImportDialog, PortForwardProfileForm) become modal dialogs. QuickConnectDialog becomes a centered command-palette overlay.

**Tech Stack:** Tailwind CSS v4 (Vite plugin), React 19, Zustand, xterm.js

---

### Task 1: Install and configure Tailwind CSS

**Files:**
- Modify: `apps/ui/package.json`
- Create: `apps/ui/src/index.css`
- Modify: `apps/ui/src/main.tsx`
- Modify: `apps/ui/vite.config.ts`
- Modify: `apps/ui/index.html`

**Step 1: Install Tailwind CSS v4 with Vite plugin**

Run from repo root:
```bash
pnpm --filter @sshterm/ui add -D @tailwindcss/vite tailwindcss
```

**Step 2: Configure Vite plugin**

Modify `apps/ui/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

**Step 3: Create CSS entry point**

Create `apps/ui/src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-base-900: #0b1020;
  --color-base-800: #0f172a;
  --color-base-700: #1e293b;
  --color-base-600: #334155;
  --color-surface: #020617;
  --color-border: rgba(148, 163, 184, 0.14);
  --color-border-bright: rgba(148, 163, 184, 0.25);
  --color-accent: #38bdf8;
  --color-accent-dim: rgba(125, 211, 252, 0.35);
  --color-text-primary: #e2e8f0;
  --color-text-secondary: #94a3b8;
  --color-text-muted: #64748b;
  --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

/* Reset for Electron — no overflow on body, app fills viewport */
html, body, #root {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--color-base-900);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

/* Scrollbar styling for dark theme */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.35);
}
```

**Step 4: Import CSS in main.tsx**

Modify `apps/ui/src/main.tsx` — add at top:
```typescript
import "./index.css";
```

**Step 5: Add Inter font to index.html**

Add to `<head>` in `apps/ui/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

**Step 6: Verify Tailwind works**

Run: `pnpm --filter @sshterm/ui dev`

Temporarily add `className="text-red-500"` to the `<h1>` in Workbench.tsx and confirm it turns red in browser.

**Step 7: Commit**
```bash
git add apps/ui/
git commit -m "feat(ui): add Tailwind CSS v4 with custom dark theme"
```

---

### Task 2: Create the AppShell layout component

**Files:**
- Create: `apps/ui/src/features/layout/AppShell.tsx`
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Create AppShell**

Create `apps/ui/src/features/layout/AppShell.tsx`:
```tsx
import { useState } from "react";

export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-base-800 transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-12"
        }`}
      >
        {/* Sidebar header with collapse toggle */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          {sidebarOpen && (
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              SSHTerm
            </span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-base-700 transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={`transition-transform ${sidebarOpen ? "" : "rotate-180"}`}
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Sidebar content */}
        {sidebarOpen && (
          <div className="flex-1 overflow-y-auto py-2">
            {sidebar}
          </div>
        )}
      </aside>

      {/* Main workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-base-900">
        {children}
      </main>
    </div>
  );
}
```

**Step 2: Wire into App.tsx temporarily**

Modify `apps/ui/src/app/App.tsx`:
```tsx
import { AppShell } from "../features/layout/AppShell";

export function App() {
  return (
    <AppShell
      sidebar={
        <div className="px-3 text-sm text-text-secondary">Hosts go here</div>
      }
    >
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No sessions open
      </div>
    </AppShell>
  );
}
```

**Step 3: Run and verify the sidebar + workspace split renders**

Run: `pnpm --filter @sshterm/ui dev`

**Step 4: Commit**
```bash
git add apps/ui/src/
git commit -m "feat(ui): add AppShell with collapsible sidebar layout"
```

---

### Task 3: Create the sidebar host list

**Files:**
- Create: `apps/ui/src/features/sidebar/Sidebar.tsx`
- Create: `apps/ui/src/features/sidebar/SidebarHostList.tsx`
- Create: `apps/ui/src/features/sidebar/SidebarSection.tsx`

**Step 1: Create SidebarSection**

Create `apps/ui/src/features/sidebar/SidebarSection.tsx`:
```tsx
import { useState } from "react";

export interface SidebarSectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function SidebarSection({
  title,
  actions,
  children,
  defaultOpen = true
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="px-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
        </span>
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}
```

**Step 2: Create SidebarHostList**

Create `apps/ui/src/features/sidebar/SidebarHostList.tsx`:
```tsx
import type { HostRecord } from "../hosts/HostsView";

export interface SidebarHostListProps {
  hosts: HostRecord[];
  onConnect: (host: HostRecord) => void;
  onEdit: (host: HostRecord) => void;
}

export function SidebarHostList({ hosts, onConnect, onEdit }: SidebarHostListProps) {
  const grouped = new Map<string, HostRecord[]>();
  for (const host of hosts) {
    const group = host.group || "Ungrouped";
    const list = grouped.get(group) ?? [];
    list.push(host);
    grouped.set(group, list);
  }

  return (
    <div className="space-y-0.5 px-1">
      {[...grouped.entries()].map(([group, groupHosts]) => (
        <div key={group}>
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-text-muted">
            {group}
          </div>
          {groupHosts.map((host) => (
            <button
              key={host.id}
              onDoubleClick={() => onConnect(host)}
              onClick={() => onEdit(host)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-sm hover:bg-base-700 transition-colors group"
              title={`${host.hostname}:${host.port} — double-click to connect`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-text-primary truncate text-[13px]">{host.name}</div>
                <div className="text-text-muted text-[11px] truncate">
                  {host.hostname}:{host.port}
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
      {hosts.length === 0 && (
        <div className="px-2 py-4 text-xs text-text-muted text-center">
          No hosts yet
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create the Sidebar orchestrator**

Create `apps/ui/src/features/sidebar/Sidebar.tsx`:
```tsx
import { useState } from "react";

import type { HostRecord } from "../hosts/HostsView";
import { SidebarHostList } from "./SidebarHostList";
import { SidebarSection } from "./SidebarSection";

const demoHosts: HostRecord[] = [
  {
    id: "host-1",
    name: "web-01",
    hostname: "web-01.example.com",
    port: 22,
    username: "admin",
    group: "Production",
    tags: "web,linux,prod",
    notes: "Primary web server"
  },
  {
    id: "host-2",
    name: "bastion",
    hostname: "bastion.example.com",
    port: 22,
    username: "ops",
    group: "Infrastructure",
    tags: "jump,prod",
    notes: "Use for multi-hop access"
  }
];

export interface SidebarProps {
  onConnectHost: (host: HostRecord) => void;
  onEditHost: (host: HostRecord) => void;
  onNewHost: () => void;
  onImportSshConfig: () => void;
}

export function Sidebar({
  onConnectHost,
  onEditHost,
  onNewHost,
  onImportSshConfig
}: SidebarProps) {
  const [hosts] = useState<HostRecord[]>(demoHosts);

  return (
    <div className="flex flex-col h-full">
      {/* Quick connect hint */}
      <button
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true })
          );
        }}
        className="mx-3 mt-2 mb-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left">Quick Connect</span>
        <kbd className="text-[10px] text-text-muted bg-base-700 px-1 py-0.5 rounded">Ctrl+K</kbd>
      </button>

      {/* Host list */}
      <SidebarSection
        title="Hosts"
        actions={
          <div className="flex gap-0.5">
            <button
              onClick={onImportSshConfig}
              className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-base-700 transition-colors"
              title="Import SSH config"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={onNewHost}
              className="p-1 rounded text-text-muted hover:text-text-secondary hover:bg-base-700 transition-colors"
              title="New host"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        }
      >
        <SidebarHostList
          hosts={hosts}
          onConnect={onConnectHost}
          onEdit={onEditHost}
        />
      </SidebarSection>

      {/* Bottom area */}
      <div className="mt-auto border-t border-border px-3 py-2">
        <div className="text-[11px] text-text-muted">SSHTerm v0.1.0</div>
      </div>
    </div>
  );
}
```

**Step 4: Commit**
```bash
git add apps/ui/src/features/sidebar/
git commit -m "feat(ui): add sidebar with grouped host list"
```

---

### Task 4: Create the tab bar and terminal workspace

**Files:**
- Create: `apps/ui/src/features/layout/TabBar.tsx`
- Create: `apps/ui/src/features/layout/Workspace.tsx`

**Step 1: Create TabBar**

Create `apps/ui/src/features/layout/TabBar.tsx`:
```tsx
import type { LayoutTab } from "./layoutStore";

export interface TabBarProps {
  tabs: LayoutTab[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

export function TabBar({ tabs, activeSessionId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end border-b border-border bg-base-800 px-2 pt-1.5 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.sessionId === activeSessionId;
        return (
          <button
            key={tab.sessionId}
            onClick={() => onActivate(tab.sessionId)}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-t-lg transition-colors max-w-[180px] ${
              isActive
                ? "bg-base-900 text-text-primary border-t border-x border-border"
                : "text-text-secondary hover:text-text-primary hover:bg-base-700/50"
            }`}
          >
            <span className="truncate">{tab.title}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.sessionId);
              }}
              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-base-600 transition-opacity text-text-muted hover:text-text-primary"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            {/* Active indicator line */}
            {isActive && (
              <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-accent rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Create Workspace**

Create `apps/ui/src/features/layout/Workspace.tsx`:
```tsx
import { useStore } from "zustand";

import { TerminalPane } from "../terminal/TerminalPane";
import { layoutStore } from "./layoutStore";
import { TabBar } from "./TabBar";

export function Workspace() {
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const activeSessionId = useStore(layoutStore, (s) => s.activeSessionId);
  const activateTab = useStore(layoutStore, (s) => s.activateTab);
  const replaceSessionId = useStore(layoutStore, (s) => s.replaceSessionId);
  const activeTab =
    tabs.find((t) => t.sessionId === activeSessionId) ?? tabs[0] ?? null;

  const closeTab = (sessionId: string) => {
    window.sshterm?.closeSession({ sessionId }).catch(() => {});
    layoutStore.setState((state) => {
      const nextTabs = state.tabs.filter((t) => t.sessionId !== sessionId);
      const nextActive =
        state.activeSessionId === sessionId
          ? nextTabs[nextTabs.length - 1]?.sessionId ?? null
          : state.activeSessionId;
      return { tabs: nextTabs, activeSessionId: nextActive };
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabBar
        tabs={tabs}
        activeSessionId={activeSessionId}
        onActivate={activateTab}
        onClose={closeTab}
      />

      {activeTab ? (
        <div className="flex-1 min-h-0">
          <TerminalPane
            key={activeTab.sessionId}
            title={activeTab.title}
            transport={activeTab.transport ?? "ssh"}
            profileId={activeTab.profileId ?? activeTab.sessionId}
            sessionId={activeTab.preopened ? activeTab.sessionId : undefined}
            autoConnect={!activeTab.preopened}
            onSessionOpened={(sessionId) => {
              replaceSessionId(activeTab.sessionId, sessionId);
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-secondary">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-text-muted">
            <rect x="6" y="10" width="36" height="28" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M14 22L20 28L14 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 34H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="text-sm">No sessions open</div>
          <div className="text-xs text-text-muted">
            Double-click a host or press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-base-700 text-text-secondary text-[11px]">
              Ctrl+K
            </kbd>{" "}
            to connect
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**
```bash
git add apps/ui/src/features/layout/
git commit -m "feat(ui): add TabBar and Workspace with empty state"
```

---

### Task 5: Convert TerminalPane to Tailwind

**Files:**
- Modify: `apps/ui/src/features/terminal/TerminalPane.tsx`

**Step 1: Replace inline styles with Tailwind classes**

Rewrite `apps/ui/src/features/terminal/TerminalPane.tsx`:
```tsx
import { useEffect } from "react";

import { useTerminalSession } from "./useTerminalSession";

export interface TerminalPaneProps {
  transport: "ssh" | "serial";
  profileId: string;
  sessionId?: string;
  autoConnect?: boolean;
  title?: string;
  onSessionOpened?: (sessionId: string) => void;
}

export function TerminalPane({
  transport,
  profileId,
  sessionId,
  autoConnect,
  title = "Terminal",
  onSessionOpened
}: TerminalPaneProps) {
  const session = useTerminalSession({
    transport,
    profileId,
    sessionId,
    autoConnect,
    onSessionOpened
  });
  const { fit } = session;

  useEffect(() => {
    fit();
  }, [fit]);

  return (
    <div className="flex flex-col h-full">
      {/* Terminal header */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border bg-base-800">
        <div>
          <div className="text-[13px] font-medium text-text-primary">{title}</div>
          <div className="text-[11px] text-text-muted">
            {transport.toUpperCase()} · {profileId}
          </div>
        </div>
        <div className="text-[11px] text-text-muted">{session.state}</div>
      </div>

      {/* Terminal container — fills remaining space */}
      <div
        ref={session.containerRef}
        className="flex-1 min-h-0 p-1 bg-surface"
      />
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add apps/ui/src/features/terminal/TerminalPane.tsx
git commit -m "refactor(ui): convert TerminalPane to Tailwind"
```

---

### Task 6: Create modal dialog component and convert forms

**Files:**
- Create: `apps/ui/src/features/layout/Modal.tsx`
- Modify: `apps/ui/src/features/hosts/HostForm.tsx`
- Modify: `apps/ui/src/features/hosts/SshConfigImportDialog.tsx`

**Step 1: Create Modal component**

Create `apps/ui/src/features/layout/Modal.tsx`:
```tsx
import { useEffect, useRef } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg mx-4 rounded-xl border border-border bg-base-800 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-base-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
```

**Step 2: Convert HostForm to Tailwind**

Rewrite `apps/ui/src/features/hosts/HostForm.tsx`:
```tsx
import { useEffect, useId, useState } from "react";

export type HostFormValue = {
  name: string;
  hostname: string;
  port: number;
  username: string;
  group: string;
  tags: string;
};

export interface HostFormProps {
  initialValue?: Partial<HostFormValue>;
  submitLabel?: string;
  onSubmit: (value: HostFormValue) => void;
}

const defaultValue: HostFormValue = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
  group: "",
  tags: ""
};

export function HostForm({
  initialValue,
  submitLabel = "Save host",
  onSubmit
}: HostFormProps) {
  const formId = useId();
  const [value, setValue] = useState<HostFormValue>({
    ...defaultValue,
    ...initialValue
  });

  useEffect(() => {
    setValue({ ...defaultValue, ...initialValue });
  }, [initialValue]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
      className="grid gap-4"
    >
      <label htmlFor={`${formId}-name`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Name</span>
        <input
          id={`${formId}-name`}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-dim"
        />
      </label>

      <label htmlFor={`${formId}-hostname`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Hostname</span>
        <input
          id={`${formId}-hostname`}
          value={value.hostname}
          onChange={(e) => setValue({ ...value, hostname: e.target.value })}
          placeholder="web-01.example.com"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-dim"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${formId}-port`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Port</span>
          <input
            id={`${formId}-port`}
            type="number"
            value={value.port}
            onChange={(e) => setValue({ ...value, port: Number(e.target.value) || 22 })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-dim"
          />
        </label>
        <label htmlFor={`${formId}-username`} className="grid gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Username</span>
          <input
            id={`${formId}-username`}
            value={value.username}
            onChange={(e) => setValue({ ...value, username: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-dim"
          />
        </label>
      </div>

      <label htmlFor={`${formId}-group`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Group</span>
        <input
          id={`${formId}-group`}
          value={value.group}
          onChange={(e) => setValue({ ...value, group: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-dim"
        />
      </label>

      <label htmlFor={`${formId}-tags`} className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Tags</span>
        <input
          id={`${formId}-tags`}
          value={value.tags}
          onChange={(e) => setValue({ ...value, tags: e.target.value })}
          placeholder="prod, linux, db"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-dim"
        />
      </label>

      <button
        type="submit"
        className="justify-self-start rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  );
}
```

**Step 3: Convert SshConfigImportDialog to Tailwind**

Rewrite `apps/ui/src/features/hosts/SshConfigImportDialog.tsx` — keep the `previewSshConfig` function unchanged, replace all inline styles with Tailwind classes:
```tsx
import { useMemo, useState } from "react";

export type SshConfigImportItem = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
};

// ... keep previewSshConfig function exactly as-is ...

export function SshConfigImportDialog({
  initialValue = "",
  onImport
}: SshConfigImportDialogProps) {
  const [value, setValue] = useState(initialValue);
  const preview = useMemo(() => previewSshConfig(value), [value]);

  return (
    <div className="grid gap-4">
      <p className="text-xs text-text-secondary">
        Paste ~/.ssh/config content to preview imported hosts.
      </p>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder={`Host web\n  HostName web-01.example.com\n  User admin`}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-accent-dim resize-y"
      />

      <div className="grid gap-1.5">
        {preview.map((item) => (
          <div
            key={item.alias}
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-base-900 text-sm"
          >
            <span className="font-medium text-text-primary">{item.alias}</span>
            <span className="text-text-muted text-xs">
              {item.user ?? "no user"} {item.hostName ? `· ${item.hostName}` : ""}{" "}
              {item.port ? `· ${item.port}` : ""}
            </span>
          </div>
        ))}
        {preview.length === 0 && (
          <div className="text-xs text-text-muted py-2">No hosts found in the pasted config.</div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onImport(preview)}
        className="justify-self-start rounded-lg border border-accent-dim bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors"
      >
        Import {preview.length} host{preview.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
```

**Step 4: Commit**
```bash
git add apps/ui/src/
git commit -m "feat(ui): add Modal component, convert HostForm and SshConfigImport to Tailwind"
```

---

### Task 7: Convert QuickConnectDialog to command-palette overlay

**Files:**
- Modify: `apps/ui/src/features/quick-connect/QuickConnectDialog.tsx`

**Step 1: Rewrite as a centered overlay**

Rewrite `apps/ui/src/features/quick-connect/QuickConnectDialog.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "react";

import { searchProfiles, type QuickConnectProfile } from "./searchIndex";

export interface QuickConnectDialogProps {
  open: boolean;
  onClose: () => void;
  profiles?: QuickConnectProfile[];
  onOpenProfile?: (profile: QuickConnectProfile) => void;
}

const defaultProfiles: QuickConnectProfile[] = [
  {
    id: "host-1",
    label: "web-01",
    hostname: "web-01.example.com",
    transport: "ssh",
    group: "Production",
    tags: ["web", "linux"]
  },
  {
    id: "serial-1",
    label: "Console / COM3",
    hostname: "COM3",
    transport: "serial",
    group: "Lab",
    tags: ["serial"]
  }
];

export function QuickConnectDialog({
  open,
  onClose,
  profiles = defaultProfiles,
  onOpenProfile
}: QuickConnectDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchProfiles(profiles, query), [profiles, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-4 rounded-xl border border-border-bright bg-base-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hosts, tags, groups…"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="text-[10px] text-text-muted bg-base-700 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div className="max-h-64 overflow-y-auto p-1.5">
          {results.map((profile) => (
            <button
              key={profile.id}
              onClick={() => {
                onOpenProfile?.(profile);
                onClose();
              }}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-sm hover:bg-base-700 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-text-primary truncate">{profile.label}</div>
                <div className="text-[11px] text-text-muted truncate">
                  {profile.hostname ?? "No host"} {profile.group ? `· ${profile.group}` : ""}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-text-muted bg-base-700 px-1.5 py-0.5 rounded ml-2 shrink-0">
                {profile.transport}
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-muted text-center">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add apps/ui/src/features/quick-connect/QuickConnectDialog.tsx
git commit -m "refactor(ui): convert QuickConnectDialog to command-palette overlay"
```

---

### Task 8: Wire everything together in the new App.tsx

**Files:**
- Modify: `apps/ui/src/app/App.tsx`
- Modify: `apps/ui/src/features/layout/Workbench.tsx` (keep file but gut it — logic moves to App)

**Step 1: Rewrite App.tsx as the top-level orchestrator**

Rewrite `apps/ui/src/app/App.tsx`:
```tsx
import { useCallback, useEffect, useState } from "react";
import { useStore } from "zustand";

import { broadcastStore } from "../features/broadcast/broadcastStore";
import type { HostFormValue } from "../features/hosts/HostForm";
import { HostForm } from "../features/hosts/HostForm";
import type { HostRecord } from "../features/hosts/HostsView";
import {
  SshConfigImportDialog,
  type SshConfigImportItem
} from "../features/hosts/SshConfigImportDialog";
import { AppShell } from "../features/layout/AppShell";
import { Modal } from "../features/layout/Modal";
import { Workspace } from "../features/layout/Workspace";
import { layoutStore } from "../features/layout/layoutStore";
import { QuickConnectDialog } from "../features/quick-connect/QuickConnectDialog";
import type { QuickConnectProfile } from "../features/quick-connect/searchIndex";
import { sessionRecoveryStore } from "../features/sessions/sessionRecoveryStore";
import { Sidebar } from "../features/sidebar/Sidebar";

const demoHosts: HostRecord[] = [
  {
    id: "host-1",
    name: "web-01",
    hostname: "web-01.example.com",
    port: 22,
    username: "admin",
    group: "Production",
    tags: "web,linux,prod",
    notes: "Primary web server"
  },
  {
    id: "host-2",
    name: "bastion",
    hostname: "bastion.example.com",
    port: 22,
    username: "ops",
    group: "Infrastructure",
    tags: "jump,prod",
    notes: "Use for multi-hop access"
  }
];

export function App() {
  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<HostRecord | null>(null);

  const openTab = useStore(layoutStore, (s) => s.openTab);
  const tabs = useStore(layoutStore, (s) => s.tabs);
  const broadcastEnabled = useStore(broadcastStore, (s) => s.enabled);
  const broadcastTargets = useStore(broadcastStore, (s) => s.targetSessionIds);
  const toggleBroadcast = useStore(broadcastStore, (s) => s.toggle);
  const setBroadcastTargets = useStore(broadcastStore, (s) => s.setTargets);
  const rememberSession = useStore(sessionRecoveryStore, (s) => s.remember);

  useEffect(() => {
    for (const tab of tabs) {
      rememberSession(tab.sessionId);
    }
    setBroadcastTargets(tabs.map((t) => t.sessionId));
  }, [rememberSession, setBroadcastTargets, tabs]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsQuickConnectOpen(true);
      }
      if (e.key.toLowerCase() === "b" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleBroadcast();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleBroadcast]);

  useEffect(() => {
    return window.sshterm?.onQuickConnect?.(() => {
      setIsQuickConnectOpen(true);
    });
  }, []);

  const connectHost = useCallback(
    async (host: HostRecord) => {
      const fallbackSessionId = `ssh-${host.id}-${Date.now()}`;
      if (window.sshterm?.openSession) {
        try {
          const opened = await window.sshterm.openSession({
            transport: "ssh",
            profileId: host.hostname,
            cols: 120,
            rows: 40
          });
          openTab({
            sessionId: opened.sessionId,
            title: host.name,
            transport: "ssh",
            profileId: host.hostname,
            preopened: true
          });
          return;
        } catch {
          // fall through
        }
      }
      openTab({
        sessionId: fallbackSessionId,
        title: host.name,
        transport: "ssh",
        profileId: host.hostname,
        preopened: false
      });
    },
    [openTab]
  );

  const profiles: QuickConnectProfile[] = demoHosts.map((h) => ({
    id: h.id,
    label: h.name,
    hostname: h.hostname,
    transport: "ssh" as const,
    group: h.group,
    tags: h.tags?.split(",").map((t) => t.trim()) ?? []
  }));

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            onConnectHost={connectHost}
            onEditHost={(host) => {
              setEditingHost(host);
              setHostModalOpen(true);
            }}
            onNewHost={() => {
              setEditingHost(null);
              setHostModalOpen(true);
            }}
            onImportSshConfig={() => setImportModalOpen(true)}
          />
        }
      >
        {/* Broadcast indicator */}
        {broadcastEnabled && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-yellow-900/50 bg-yellow-950/30 text-yellow-300 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Broadcast mode active — {broadcastTargets.length} session
            {broadcastTargets.length === 1 ? "" : "s"}
          </div>
        )}

        <Workspace />
      </AppShell>

      {/* Quick Connect overlay */}
      <QuickConnectDialog
        open={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        profiles={profiles}
        onOpenProfile={async (profile) => {
          const host = demoHosts.find((h) => h.id === profile.id);
          if (host) await connectHost(host);
        }}
      />

      {/* Host form modal */}
      <Modal
        open={hostModalOpen}
        onClose={() => setHostModalOpen(false)}
        title={editingHost ? `Edit ${editingHost.name}` : "New Host"}
      >
        <HostForm
          key={editingHost?.id ?? "new"}
          initialValue={editingHost ?? undefined}
          submitLabel={editingHost ? "Update host" : "Add host"}
          onSubmit={(_value: HostFormValue) => {
            setHostModalOpen(false);
          }}
        />
      </Modal>

      {/* SSH Config import modal */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import SSH Config"
      >
        <SshConfigImportDialog
          onImport={(_items: SshConfigImportItem[]) => {
            setImportModalOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
```

**Step 2: Simplify Workbench.tsx to a re-export (preserve for backward compat with tests)**

Rewrite `apps/ui/src/features/layout/Workbench.tsx`:
```tsx
export { Workspace as Workbench } from "./Workspace";
```

**Step 3: Run tests**

Run: `pnpm --filter @sshterm/ui test`

Fix any broken imports. The existing E2E tests may need updates if they look for specific text content.

**Step 4: Run the dev server and verify the full layout**

Run: `pnpm --filter @sshterm/ui dev`

Verify:
- Sidebar with grouped hosts appears on the left
- Collapsing sidebar works
- Empty state shows in workspace
- Ctrl+K opens the command palette
- Double-clicking a host opens a tab
- Host form opens in modal
- SSH Config import opens in modal

**Step 5: Commit**
```bash
git add apps/ui/src/
git commit -m "feat(ui): wire sidebar+workspace layout with modals and overlays"
```

---

### Task 9: Run full test suite and build

**Step 1: Run unit tests**

Run: `pnpm test`

Fix any failures. Most likely the Workbench tests will need updating since Workbench was gutted.

**Step 2: Run E2E tests**

Run: `pnpm --filter @sshterm/ui test:e2e`

Fix any failures — selectors may have changed.

**Step 3: Run production build**

Run: `pnpm build`

Verify no TypeScript or build errors.

**Step 4: Run the packaged app**

Run: `pnpm release:windows:unsigned`

Launch the built exe and verify the redesigned UI works in the packaged Electron app.

**Step 5: Commit any test fixes**
```bash
git add .
git commit -m "fix: update tests for UI redesign"
```

---

Plan complete and saved to `docs/plans/2026-04-06-ui-redesign.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?