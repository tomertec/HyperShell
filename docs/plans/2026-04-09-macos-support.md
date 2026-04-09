# Task 3.1: macOS Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make HyperShell build, package, and run correctly on macOS with proper platform conventions (app menu, tray icon, DMG installer).

**Architecture:** Four independent changes: (1) macOS app menu in createAppMenu.ts, (2) tray template icons + extraResources in electron-builder, (3) DMG/zip packaging targets in electron-builder.yml + package.json scripts, (4) macOS CI jobs in GitHub Actions. Each can be committed independently.

**Tech Stack:** Electron 34, electron-builder 26, GitHub Actions (macos-latest runner)

---

### Task 1: macOS App Menu

macOS expects the first menu item to be the app name menu with About, Preferences, and Quit. Without it, Cmd+Q doesn't work and the menu bar looks broken.

**Files:**
- Modify: `apps/desktop/src/main/menu/createAppMenu.ts`
- Test: `apps/desktop/src/main/menu/createAppMenu.test.ts`

**Step 1: Write the test**

Create `apps/desktop/src/main/menu/createAppMenu.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

let capturedTemplate: unknown[];

vi.mock("electron", () => ({
  app: { name: "HyperShell" },
  Menu: {
    buildFromTemplate: vi.fn((t: unknown[]) => {
      capturedTemplate = t;
      return t;
    }),
    setApplicationMenu: vi.fn(),
  },
}));

import { createAppMenu } from "./createAppMenu";

describe("createAppMenu", () => {
  beforeEach(() => {
    capturedTemplate = [];
    createAppMenu();
  });

  it("includes an app-name menu on macOS with About and Quit", () => {
    // On darwin the first menu label should be the app name
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    capturedTemplate = [];
    createAppMenu();

    Object.defineProperty(process, "platform", { value: originalPlatform });

    const first = capturedTemplate[0] as { label: string; submenu: { role?: string }[] };
    const roles = first.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain("about");
    expect(roles).toContain("quit");
  });

  it("includes a Window menu on macOS with minimize and close", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    capturedTemplate = [];
    createAppMenu();

    Object.defineProperty(process, "platform", { value: originalPlatform });

    const labels = capturedTemplate.map((m: { label?: string }) => m.label);
    expect(labels).toContain("Window");

    const windowMenu = capturedTemplate.find(
      (m: { label?: string }) => m.label === "Window"
    ) as { submenu: { role?: string }[] };
    const roles = windowMenu.submenu.map((s: { role?: string }) => s.role).filter(Boolean);
    expect(roles).toContain("minimize");
    expect(roles).toContain("close");
  });

  it("always includes View and Edit menus", () => {
    const labels = capturedTemplate.map((m: { label?: string }) => m.label);
    expect(labels).toContain("View");
    expect(labels).toContain("Edit");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/desktop test -- --run createAppMenu`
Expected: FAIL — no "about" role, no "Window" menu

**Step 3: Implement the macOS menu**

Replace `apps/desktop/src/main/menu/createAppMenu.ts`:

```typescript
import { app, Menu } from "electron";

/**
 * Creates and sets the application menu.
 * On macOS, adds the standard app-name menu (About, Preferences, Quit)
 * and Window menu (Minimize, Zoom, Close).
 * The menu is hidden on Windows (custom titlebar) but accelerators still work.
 */
export function createAppMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Shift+=",
          role: "zoomIn",
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+Shift+-",
          role: "zoomOut",
        },
        {
          label: "Reset Zoom",
          accelerator: "CmdOrCtrl+Shift+0",
          role: "resetZoom",
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          role: "toggleDevTools",
        },
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+Shift+R",
          role: "reload",
        },
      ],
    },
    ...(isMac
      ? [
          {
            label: "Window",
            submenu: [
              { role: "minimize" as const },
              { role: "zoom" as const },
              { type: "separator" as const },
              { role: "close" as const },
              { type: "separator" as const },
              { role: "front" as const },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/desktop test -- --run createAppMenu`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/menu/createAppMenu.ts apps/desktop/src/main/menu/createAppMenu.test.ts
git commit -m "feat(macos): add macOS app menu with About, Hide, Window submenu"
```

---

### Task 2: Tray Template Icon for macOS

macOS requires monochrome "template" images for the menu bar. The naming convention `fooTemplate.png` tells Electron to treat it as a template image (auto-tints for light/dark menu bar). We also need to add the `extraResources` config so icons are bundled.

**Files:**
- Create: `apps/desktop/assets/tray.ico` (Windows, already referenced but missing)
- Create: `apps/desktop/assets/trayTemplate.png` (macOS, 22x22 monochrome)
- Create: `apps/desktop/assets/trayTemplate@2x.png` (macOS Retina, 44x44 monochrome)
- Modify: `apps/desktop/electron-builder.yml` — add `extraResources`

**Step 1: Create tray icon assets**

Generate monochrome PNG tray icons. These should be simple terminal/shell icons:
- `trayTemplate.png`: 22x22px, monochrome (black on transparent), PNG
- `trayTemplate@2x.png`: 44x44px, same design at 2x
- `tray.ico`: 16x16 + 32x32 multi-size ICO for Windows

Use a simple `>_` terminal prompt glyph rendered programmatically or from an SVG. If generating programmatically isn't feasible, create minimal placeholder PNGs using Node.js canvas or a simple SVG-to-PNG conversion.

For a quick approach, create them with an inline Node script on the macOS VM or use ImageMagick:

```bash
# On macOS VM — create a simple monochrome terminal icon
# Install imagemagick: brew install imagemagick
# 22x22 template
convert -size 22x22 xc:transparent \
  -font Courier -pointsize 16 -fill black \
  -gravity center -annotate 0 ">_" \
  apps/desktop/assets/trayTemplate.png

# 44x44 @2x template
convert -size 44x44 xc:transparent \
  -font Courier -pointsize 32 -fill black \
  -gravity center -annotate 0 ">_" \
  apps/desktop/assets/trayTemplate@2x.png

# Windows ICO
convert -size 32x32 xc:transparent \
  -font Courier -pointsize 24 -fill white \
  -gravity center -annotate 0 ">_" \
  apps/desktop/assets/tray.ico
```

**Step 2: Add extraResources to electron-builder.yml**

Add to `apps/desktop/electron-builder.yml` after the `directories` block:

```yaml
extraResources:
  - from: assets
    to: assets
    filter:
      - "**/*"
```

This copies the `assets/` directory into `resources/assets/` in the packaged app, which is where `createTray.ts` looks (`process.resourcesPath + '/assets/'`).

**Step 3: Verify tray code handles both platforms**

The existing `createTray.ts` line 68 already does:
```typescript
process.platform === "win32" ? "tray.ico" : "trayTemplate.png"
```

This is correct — Electron automatically picks up `trayTemplate@2x.png` for Retina displays when the base name matches.

**Step 4: Commit**

```bash
git add apps/desktop/assets/ apps/desktop/electron-builder.yml
git commit -m "feat(macos): add tray template icons and extraResources config"
```

---

### Task 3: DMG Packaging

Add macOS packaging targets to electron-builder and npm scripts.

**Files:**
- Modify: `apps/desktop/electron-builder.yml` — add `mac:` and `dmg:` sections
- Modify: `apps/desktop/package.json` — add macOS package scripts
- Modify: `package.json` (root) — add macOS release scripts

**Step 1: Add macOS targets to electron-builder.yml**

Add after the `nsis:` block in `apps/desktop/electron-builder.yml`:

```yaml
mac:
  target:
    - target: dmg
      arch:
        - x64
    - target: zip
      arch:
        - x64
  artifactName: hypershell-${version}-mac-${arch}.${ext}
  category: public.app-category.developer-tools
  darkModeSupport: true
  hardenedRuntime: true
  entitlements: entitlements.mac.plist
  entitlementsInherit: entitlements.mac.plist
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

**Step 2: Create macOS entitlements file**

Create `apps/desktop/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <key>com.apple.security.device.serial</key>
  <true/>
</dict>
</plist>
```

Note: `com.apple.security.device.serial` is needed for serial port access (Task 3.1c).

**Step 3: Add macOS package scripts to `apps/desktop/package.json`**

Add to scripts:

```json
"package:mac:unsigned": "pnpm run prepare:package && electron-builder --config electron-builder.yml --mac --x64 --publish never"
```

**Step 4: Add root-level release script**

Add to root `package.json` scripts:

```json
"release:mac:unsigned": "pnpm --filter @hypershell/desktop run package:mac:unsigned"
```

**Step 5: Test build on macOS VM**

```bash
# Clone repo on macOS VM, install deps, build, and package
ssh macos "cd ~ && git clone <repo-url> hypershell && cd hypershell && pnpm install && pnpm build && pnpm release:mac:unsigned"
```

**Step 6: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/entitlements.mac.plist apps/desktop/package.json package.json
git commit -m "feat(macos): add DMG and zip packaging with entitlements"
```

---

### Task 4: macOS CI Pipeline

Add macOS build job to PR gates and create a macOS release workflow.

**Files:**
- Modify: `.github/workflows/pr-gates.yml` — add `macos-build` job
- Create: `.github/workflows/macos-release.yml`

**Step 1: Add macOS job to PR gates**

Add this job to `.github/workflows/pr-gates.yml` after the `windows-build` job:

```yaml
  macos-build:
    runs-on: macos-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.8.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Workspace build
        run: pnpm ci:build
```

Note: No native module rebuild needed on the CI runner since electron-builder handles it during packaging. This job just validates the TypeScript build succeeds on macOS.

**Step 2: Create macOS release workflow**

Create `.github/workflows/macos-release.yml`:

```yaml
name: macOS Release

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

concurrency:
  group: macos-release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  release:
    runs-on: macos-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.8.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium
        run: pnpm --filter @hypershell/ui exec playwright install chromium

      - name: Workspace build
        run: pnpm ci:build

      - name: Workspace unit tests
        run: pnpm ci:test

      - name: Playwright smoke
        run: pnpm ci:test:e2e

      - name: Package unsigned macOS release
        run: pnpm release:mac:unsigned

      - name: Generate release manifest
        run: pnpm release:manifest

      - name: Upload release artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-release-${{ github.ref_name }}
          path: apps/desktop/release/**
          if-no-files-found: error
          retention-days: 30
```

**Step 3: Commit**

```bash
git add .github/workflows/pr-gates.yml .github/workflows/macos-release.yml
git commit -m "feat(macos): add macOS CI build gate and release workflow"
```

---

### Task 5: Verify on macOS VM

SSH into the macOS VM and verify the full build + package pipeline works.

**Step 1: Clone and build**

```bash
ssh macos
cd ~ && git clone <repo> hypershell
cd hypershell
pnpm install
pnpm build
```

**Step 2: Run unit tests**

```bash
pnpm test
```

**Step 3: Package DMG**

```bash
pnpm release:mac:unsigned
ls -la apps/desktop/release/*.dmg
```

**Step 4: Open the DMG and verify**

Open the DMG on the Mac, drag to Applications, launch. Verify:
- App menu shows "HyperShell" with About, Hide, Quit
- Window menu has Minimize, Zoom, Close
- Cmd+Q quits the app
- Tray icon appears in menu bar (monochrome)
- SSH connections work (uses `/usr/bin/ssh`)
- PuTTY import option does NOT appear

**Step 5: Final commit if any fixes needed**

```bash
git commit -m "fix(macos): adjustments from macOS VM testing"
```

---

## Execution Order

Tasks 1-4 are independent and can be worked in parallel. Task 5 (verification) depends on all of them being done.

| Task | Deps | Est. |
|------|------|------|
| 1. App Menu | None | Small |
| 2. Tray Icons | None | Small |
| 3. DMG Packaging | None | Medium |
| 4. CI Pipeline | None | Small |
| 5. Verify on Mac | 1-4 | Manual |
