# Animated Logo & Quick Connect Welcome Screen

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the empty workspace state with an animated HyperShell logo that morphs into an inline quick connect form with SSH/Serial pill toggle.

**Architecture:** New `WelcomeScreen` component replaces the empty-state block in `Workspace.tsx`. It contains an `AnimatedLogo` sub-component (typing animation + idle glow) and a `QuickConnectForm` component (pill toggle, SSH/serial inputs, connect button). Framer Motion `layout` + `AnimatePresence` handles the morph transition. Connection dispatches go through the existing `openTab` flow in `App.tsx` via a callback prop.

**Tech Stack:** React, Framer Motion (already installed), Tailwind CSS, Zustand layoutStore

---

### Task 1: Create AnimatedLogo Component

**Files:**
- Create: `apps/ui/src/features/welcome/AnimatedLogo.tsx`

**Step 1: Create the AnimatedLogo component**

This component renders the HyperShell logo with a terminal-style typing animation on mount, then settles into an idle state with cursor blink and glow.

```tsx
import { motion, useAnimate } from "framer-motion";
import { useEffect, useState } from "react";

interface AnimatedLogoProps {
  compact?: boolean;
  onClick?: () => void;
}

export function AnimatedLogo({ compact, onClick }: AnimatedLogoProps) {
  const [phase, setPhase] = useState<"typing" | "idle">("typing");
  const [visibleChars, setVisibleChars] = useState(0);
  const text = "HyperShell";
  const prompt = ">_ ";

  // Typing effect
  useEffect(() => {
    const fullLength = prompt.length + text.length;
    if (visibleChars >= fullLength) {
      const timeout = setTimeout(() => setPhase("idle"), 300);
      return () => clearTimeout(timeout);
    }
    const delay = visibleChars < prompt.length ? 80 : 60 + Math.random() * 40;
    const timeout = setTimeout(() => setVisibleChars((c) => c + 1), delay);
    return () => clearTimeout(timeout);
  }, [visibleChars]);

  const displayedPrompt = prompt.slice(0, Math.min(visibleChars, prompt.length));
  const displayedText = text.slice(
    0,
    Math.max(0, visibleChars - prompt.length)
  );

  return (
    <motion.button
      layout
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 cursor-pointer select-none focus:outline-none"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Glow effect */}
      <div
        className={`absolute -inset-8 rounded-full blur-2xl transition-opacity duration-1000 ${
          phase === "idle"
            ? "opacity-100 bg-accent/[0.06]"
            : "opacity-0"
        }`}
      />
      <motion.div
        layout
        className="relative flex items-baseline gap-0"
        style={{ fontSize: compact ? "1.5rem" : "2.5rem" }}
      >
        <span className="font-mono text-accent/70 font-light">{displayedPrompt}</span>
        <span className="font-mono font-semibold text-text-primary tracking-tight">
          {displayedText}
        </span>
        {/* Blinking cursor */}
        <motion.span
          className="inline-block w-[2px] bg-accent ml-0.5 rounded-full"
          style={{
            height: compact ? "1.2rem" : "2rem",
            verticalAlign: "baseline",
          }}
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: "steps(1)" }}
        />
      </motion.div>

      {/* Subtitle - only when not compact */}
      {!compact && phase === "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-xs text-text-muted"
        >
          Click to connect
        </motion.div>
      )}
    </motion.button>
  );
}
```

**Step 2: Verify it renders**

Run: `pnpm --filter @hypershell/ui build`
Expected: No TypeScript errors

---

### Task 2: Create TransportToggle (Pill Switcher)

**Files:**
- Create: `apps/ui/src/features/welcome/TransportToggle.tsx`

**Step 1: Create the pill toggle component**

```tsx
import { motion } from "framer-motion";

export type TransportMode = "ssh" | "serial";

interface TransportToggleProps {
  value: TransportMode;
  onChange: (mode: TransportMode) => void;
}

export function TransportToggle({ value, onChange }: TransportToggleProps) {
  return (
    <div className="relative flex items-center bg-base-800 rounded-full p-0.5 border border-border/60">
      {/* Sliding highlight */}
      <motion.div
        layout
        className="absolute top-0.5 bottom-0.5 rounded-full bg-accent/[0.12] border border-accent/20"
        style={{ width: "50%" }}
        animate={{ x: value === "ssh" ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
      <button
        onClick={() => onChange("ssh")}
        className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors ${
          value === "ssh" ? "text-accent" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        SSH
      </button>
      <button
        onClick={() => onChange("serial")}
        className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors ${
          value === "serial" ? "text-accent" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        Serial
      </button>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `pnpm --filter @hypershell/ui build`
Expected: No TypeScript errors

---

### Task 3: Create QuickConnectForm Component

**Files:**
- Create: `apps/ui/src/features/welcome/QuickConnectForm.tsx`

**Step 1: Create the form component**

This component holds the SSH/Serial input fields and connect button. SSH mode shows hostname, port, username, password. Serial mode shows COM port dropdown, baud rate, plus a "More options" expander.

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { TransportToggle, type TransportMode } from "./TransportToggle";

interface QuickConnectFormProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: SerialAdvancedOptions) => void;
  onCancel: () => void;
}

export interface SerialAdvancedOptions {
  dataBits: number;
  stopBits: number;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "rtscts" | "xonxoff";
}

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const inputClass =
  "w-full bg-base-750 border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors";

const selectClass =
  "w-full bg-base-750 border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-colors appearance-none";

export function QuickConnectForm({
  availablePorts,
  onRefreshPorts,
  onConnectSsh,
  onConnectSerial,
  onCancel,
}: QuickConnectFormProps) {
  const [mode, setMode] = useState<TransportMode>("ssh");

  // SSH fields
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Serial fields
  const [comPort, setComPort] = useState("");
  const [baudRate, setBaudRate] = useState("9600");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataBits, setDataBits] = useState("8");
  const [stopBits, setStopBits] = useState("1");
  const [parity, setParity] = useState<"none" | "even" | "odd">("none");
  const [flowControl, setFlowControl] = useState<"none" | "rtscts" | "xonxoff">("none");

  useEffect(() => {
    if (mode === "serial") onRefreshPorts();
  }, [mode, onRefreshPorts]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === "ssh") {
        if (!host.trim()) return;
        onConnectSsh(host.trim(), parseInt(port) || 22, username, password);
      } else {
        if (!comPort) return;
        const advanced: SerialAdvancedOptions | undefined = showAdvanced
          ? {
              dataBits: parseInt(dataBits),
              stopBits: parseInt(stopBits),
              parity,
              flowControl,
            }
          : undefined;
        onConnectSerial(comPort, parseInt(baudRate) || 9600, advanced);
      }
    },
    [mode, host, port, username, password, comPort, baudRate, showAdvanced, dataBits, stopBits, parity, flowControl, onConnectSsh, onConnectSerial]
  );

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col items-center gap-5"
    >
      <TransportToggle value={mode} onChange={setMode} />

      <AnimatePresence mode="wait">
        {mode === "ssh" ? (
          <motion.div
            key="ssh"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.15 }}
            className="w-full flex flex-col gap-3"
          >
            <input
              type="text"
              placeholder="Hostname or IP address"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputClass}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className={`${inputClass} w-24 shrink-0`}
              />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </div>
            <input
              type="password"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </motion.div>
        ) : (
          <motion.div
            key="serial"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15 }}
            className="w-full flex flex-col gap-3"
          >
            <div className="flex gap-2">
              <select
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
                className={`${selectClass} flex-1`}
              >
                <option value="" disabled>
                  {availablePorts.length ? "Select COM port" : "No ports found"}
                </option>
                {availablePorts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshPorts}
                className="px-2.5 py-2 rounded-lg border border-border/60 bg-base-750 text-text-muted hover:text-text-primary hover:border-border-bright transition-colors"
                title="Refresh ports"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11.5 7A4.5 4.5 0 1 1 7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(e.target.value)}
              className={selectClass}
            >
              {BAUD_RATES.map((r) => (
                <option key={r} value={r}>{r} baud</option>
              ))}
            </select>

            {/* More options toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors self-start"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
              >
                <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              More options
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Data bits</label>
                        <select value={dataBits} onChange={(e) => setDataBits(e.target.value)} className={selectClass}>
                          {[5, 6, 7, 8].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Stop bits</label>
                        <select value={stopBits} onChange={(e) => setStopBits(e.target.value)} className={selectClass}>
                          {[1, 2].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Parity</label>
                        <select value={parity} onChange={(e) => setParity(e.target.value as typeof parity)} className={selectClass}>
                          <option value="none">None</option>
                          <option value="even">Even</option>
                          <option value="odd">Odd</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Flow control</label>
                        <select value={flowControl} onChange={(e) => setFlowControl(e.target.value as typeof flowControl)} className={selectClass}>
                          <option value="none">None</option>
                          <option value="rtscts">RTS/CTS</option>
                          <option value="xonxoff">XON/XOFF</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-center gap-3 w-full">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border border-border/40 hover:border-border-bright transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-accent/[0.12] text-accent border border-accent/20 hover:bg-accent/[0.18] hover:border-accent/30 transition-colors"
        >
          Connect
        </button>
      </div>
    </motion.form>
  );
}
```

**Step 2: Verify it compiles**

Run: `pnpm --filter @hypershell/ui build`
Expected: No TypeScript errors

---

### Task 4: Create WelcomeScreen Composite Component

**Files:**
- Create: `apps/ui/src/features/welcome/WelcomeScreen.tsx`
- Create: `apps/ui/src/features/welcome/index.ts`

**Step 1: Create WelcomeScreen that composes AnimatedLogo + QuickConnectForm with morph transition**

```tsx
import { useState, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { AnimatedLogo } from "./AnimatedLogo";
import { QuickConnectForm, type SerialAdvancedOptions } from "./QuickConnectForm";

interface WelcomeScreenProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: SerialAdvancedOptions) => void;
}

export function WelcomeScreen({
  availablePorts,
  onRefreshPorts,
  onConnectSsh,
  onConnectSerial,
}: WelcomeScreenProps) {
  const [formOpen, setFormOpen] = useState(false);

  const handleCancel = useCallback(() => setFormOpen(false), []);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center text-text-secondary">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-b from-base-900 via-base-900 to-base-950" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_40%,rgba(56,189,248,0.03),transparent)]" />

      <div className="relative flex flex-col items-center gap-6">
        <LayoutGroup>
          <AnimatedLogo
            compact={formOpen}
            onClick={() => setFormOpen((v) => !v)}
          />

          <AnimatePresence>
            {formOpen && (
              <motion.div
                layout
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <QuickConnectForm
                  availablePorts={availablePorts}
                  onRefreshPorts={onRefreshPorts}
                  onConnectSsh={onConnectSsh}
                  onConnectSerial={onConnectSerial}
                  onCancel={handleCancel}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>

        {/* Keyboard shortcut hint - only when form is closed */}
        {!formOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, duration: 0.5 }}
            className="text-xs text-text-muted mt-2"
          >
            or press{" "}
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-base-700/80 text-text-secondary text-[11px] border border-border/50 font-medium">
              Ctrl+K
            </kbd>{" "}
            to search hosts
          </motion.div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create barrel export**

```ts
// apps/ui/src/features/welcome/index.ts
export { WelcomeScreen } from "./WelcomeScreen";
```

**Step 3: Verify it compiles**

Run: `pnpm --filter @hypershell/ui build`
Expected: No TypeScript errors

---

### Task 5: Wire WelcomeScreen into Workspace + App

**Files:**
- Modify: `apps/ui/src/features/layout/Workspace.tsx:234-268` (replace empty state)
- Modify: `apps/ui/src/app/App.tsx` (pass connection callbacks to Workspace)

**Step 1: Update Workspace to accept and render WelcomeScreen**

In `Workspace.tsx`, add a props interface and replace the empty state block (lines 234-268) with the `WelcomeScreen` component. The Workspace needs to receive connection callbacks from App.

Add props to the Workspace component:

```tsx
import { WelcomeScreen } from "../welcome";

interface WorkspaceProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: import("../welcome/QuickConnectForm").SerialAdvancedOptions) => void;
}

export function Workspace({ availablePorts, onRefreshPorts, onConnectSsh, onConnectSerial }: WorkspaceProps) {
```

Replace the empty state block (lines 234-268) with:

```tsx
      ) : (
        <WelcomeScreen
          availablePorts={availablePorts}
          onRefreshPorts={onRefreshPorts}
          onConnectSsh={onConnectSsh}
          onConnectSerial={onConnectSerial}
        />
      )}
```

**Step 2: Create ad-hoc SSH connect handler in App.tsx**

In `App.tsx`, add a `connectSshAdHoc` callback near the existing `connectHost` (around line 288):

```tsx
const connectSshAdHoc = useCallback(
  (host: string, port: number, username: string, _password: string) => {
    const sessionId = `ssh-adhoc-${Date.now()}`;
    const portSuffix = port !== 22 ? `:${port}` : "";
    const profileId = username ? `${username}@${host}${portSuffix}` : `${host}${portSuffix}`;
    openTab({
      tabKey: sessionId,
      sessionId,
      title: username ? `${username}@${host}` : host,
      transport: "ssh",
      profileId,
      preopened: false,
    });
  },
  [openTab]
);

const connectSerialAdHoc = useCallback(
  (port: string, baudRate: number) => {
    const sessionId = `serial-adhoc-${Date.now()}`;
    openTab({
      tabKey: sessionId,
      sessionId,
      title: port,
      transport: "serial",
      profileId: port,
      preopened: false,
    });
  },
  [openTab]
);
```

**Step 3: Pass props to Workspace in App.tsx render**

Find the `<Workspace />` usage and add the props:

```tsx
<Workspace
  availablePorts={availablePorts}
  onRefreshPorts={refreshPorts}
  onConnectSsh={connectSshAdHoc}
  onConnectSerial={connectSerialAdHoc}
/>
```

**Step 4: Verify build**

Run: `pnpm --filter @hypershell/ui build`
Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add apps/ui/src/features/welcome/
git add apps/ui/src/features/layout/Workspace.tsx
git add apps/ui/src/app/App.tsx
git commit -m "feat: animated logo welcome screen with quick connect form

Replace empty workspace state with typing-animation HyperShell logo.
Clicking the logo morphs it into an inline quick connect form with
SSH/Serial pill toggle, input fields, and connect button."
```

---

### Task 6: Test and Polish

**Step 1: Run existing tests to confirm nothing broke**

Run: `pnpm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No new errors

**Step 3: Fix any lint/type issues found**

**Step 4: Run E2E tests**

Run: `pnpm --filter @hypershell/ui test:e2e`
Expected: All E2E tests pass (empty state tests may need updating if they reference the old text)

**Step 5: Commit fixes if any**

```bash
git add -u
git commit -m "fix: resolve lint/test issues from welcome screen changes"
```
