# Serial Port Feature Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up serial profile CRUD, COM port enumeration, runtime DTR/RTS toggle, and complete UI across the full IPC stack.

**Architecture:** Follow the existing host IPC pattern exactly: shared channels+schemas -> main process handler -> preload API -> UI. The DB repository and serial transport already exist and are complete.

**Tech Stack:** Zod schemas, Electron IPC, React, Tailwind CSS, `serialport` npm package (`SerialPort.list()`)

---

### Task 1: Add serial profile IPC channels

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts`

**Step 1: Add serialProfiles and session setSignals channels**

Add `serialProfileChannels` namespace and `setSignals` to session channels:

```typescript
// Add before ipcChannels:
export const serialProfileChannels = {
  list: "serial-profiles:list",
  upsert: "serial-profiles:upsert",
  remove: "serial-profiles:remove",
  listPorts: "serial-profiles:list-ports"
} as const;
```

Add `setSignals: "session:set-signals"` to `sessionChannels`.

Add `serialProfiles: serialProfileChannels` to `ipcChannels`.

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/shared build`

**Step 3: Commit**

```
feat: add serial profile and setSignals IPC channel definitions
```

---

### Task 2: Add serial profile Zod schemas

**Files:**
- Modify: `packages/shared/src/ipc/schemas.ts`

**Step 1: Add schemas after the group schemas section**

```typescript
// --- Serial profile schemas ---

export const serialProfileRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  baudRate: z.number().int().positive(),
  dataBits: z.number().int().min(5).max(8),
  stopBits: z.number().int().min(1).max(2),
  parity: z.enum(["none", "even", "odd", "mark", "space"]),
  flowControl: z.enum(["none", "hardware", "software"]),
  localEcho: z.boolean(),
  dtr: z.boolean(),
  rts: z.boolean(),
  notes: z.string().nullable()
});

export const upsertSerialProfileRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  baudRate: z.number().int().positive().optional(),
  dataBits: z.number().int().min(5).max(8).optional(),
  stopBits: z.number().int().min(1).max(2).optional(),
  parity: z.enum(["none", "even", "odd", "mark", "space"]).optional(),
  flowControl: z.enum(["none", "hardware", "software"]).optional(),
  localEcho: z.boolean().optional(),
  dtr: z.boolean().optional(),
  rts: z.boolean().optional(),
  notes: z.string().nullable().optional()
});

export const removeSerialProfileRequestSchema = z.object({
  id: z.string().min(1)
});

export const serialPortInfoSchema = z.object({
  path: z.string(),
  manufacturer: z.string().optional(),
  pnpId: z.string().optional(),
  vendorId: z.string().optional(),
  productId: z.string().optional()
});

export const setSignalsRequestSchema = z.object({
  sessionId: z.string().min(1),
  signals: z.object({
    dtr: z.boolean().optional(),
    rts: z.boolean().optional()
  })
});

export type SerialProfileRecord = z.infer<typeof serialProfileRecordSchema>;
export type UpsertSerialProfileRequest = z.infer<typeof upsertSerialProfileRequestSchema>;
export type RemoveSerialProfileRequest = z.infer<typeof removeSerialProfileRequestSchema>;
export type SerialPortInfo = z.infer<typeof serialPortInfoSchema>;
export type SetSignalsRequest = z.infer<typeof setSignalsRequestSchema>;
```

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/shared build`

**Step 3: Commit**

```
feat: add serial profile and signal control Zod schemas
```

---

### Task 3: Add remove() to serial profiles repository

**Files:**
- Modify: `packages/db/src/repositories/serialProfilesRepository.ts`

**Step 1: Add remove to the SQLite repository**

In `createSerialProfilesRepositoryFromDatabase`, add a prepared statement:

```typescript
const deleteSerialProfile = db.prepare(`DELETE FROM serial_profiles WHERE id = ?`);
```

Add to the returned object:

```typescript
remove(id: string): boolean {
  const result = deleteSerialProfile.run(id);
  return result.changes > 0;
}
```

**Step 2: Add remove to the in-memory repository**

In `createInMemorySerialProfilesRepository`, add:

```typescript
remove(id: string): boolean {
  return profiles.delete(id);
}
```

**Step 3: Update the factory function and types**

Ensure `createSerialProfilesRepository` return type includes `remove`. No explicit type needed since it's inferred.

**Step 4: Verify build**

Run: `pnpm --filter @hypershell/db build`

**Step 5: Commit**

```
feat: add remove() to serial profiles repository
```

---

### Task 4: Create serial profiles IPC handler

**Files:**
- Create: `apps/desktop/src/main/ipc/serialProfilesIpc.ts`

**Step 1: Create the handler file**

Follow `groupsIpc.ts` pattern exactly (dependency-injected repo):

```typescript
import {
  ipcChannels,
  upsertSerialProfileRequestSchema,
  removeSerialProfileRequestSchema,
  type UpsertSerialProfileRequest,
  type RemoveSerialProfileRequest
} from "@hypershell/shared";
import type { SerialProfileInput, SerialProfileRecord } from "@hypershell/db";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainLike } from "./registerIpc";

type SerialProfilesRepoLike = {
  create(input: SerialProfileInput): SerialProfileRecord;
  list(): SerialProfileRecord[];
  remove(id: string): boolean;
};

export function registerSerialProfilesIpc(
  ipcMain: IpcMainLike,
  getRepo: () => SerialProfilesRepoLike
): void {
  ipcMain.handle(ipcChannels.serialProfiles.list, () => {
    return getRepo().list();
  });

  ipcMain.handle(
    ipcChannels.serialProfiles.upsert,
    (_event: IpcMainInvokeEvent, request: UpsertSerialProfileRequest) => {
      const parsed = upsertSerialProfileRequestSchema.parse(request);
      return getRepo().create(parsed);
    }
  );

  ipcMain.handle(
    ipcChannels.serialProfiles.remove,
    (_event: IpcMainInvokeEvent, request: RemoveSerialProfileRequest) => {
      const parsed = removeSerialProfileRequestSchema.parse(request);
      getRepo().remove(parsed.id);
    }
  );

  ipcMain.handle(ipcChannels.serialProfiles.listPorts, async () => {
    const { SerialPort } = await import("serialport");
    return SerialPort.list();
  });
}
```

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/desktop build`

**Step 3: Commit**

```
feat: add serial profiles IPC handler with CRUD and port enumeration
```

---

### Task 5: Add setSignals to session manager and IPC

**Files:**
- Modify: `packages/session-core/src/transports/transportEvents.ts`
- Modify: `packages/session-core/src/transports/serialTransport.ts`
- Modify: `packages/session-core/src/sessionManager.ts`

**Step 1: Add setSignals to TransportHandle**

In `transportEvents.ts`, add to `TransportHandle`:

```typescript
setSignals?(signals: { dtr?: boolean; rts?: boolean }): void;
```

**Step 2: Implement setSignals in serial transport**

In `serialTransport.ts`, extend `SerialPortLike` interface:

```typescript
set?(options: { dtr?: boolean; rts?: boolean }, callback?: (error?: Error | null) => void): void;
```

In the returned transport object, add:

```typescript
setSignals(signals: { dtr?: boolean; rts?: boolean }) {
  if (!port || hasExited || !port.isOpen || !port.set) {
    return;
  }
  port.set(signals, (error) => {
    if (error) {
      emit({
        type: "error",
        sessionId: request.sessionId,
        message: error.message
      });
    }
  });
}
```

**Step 3: Expose setSignals through SessionManager**

In `sessionManager.ts`, add to the `SessionManager` interface:

```typescript
setSignals(sessionId: string, signals: { dtr?: boolean; rts?: boolean }): void;
```

Implement:

```typescript
setSignals(sessionId: string, signals: { dtr?: boolean; rts?: boolean }): void {
  sessions.get(sessionId)?.transport.setSignals?.(signals);
}
```

**Step 4: Verify build**

Run: `pnpm --filter @hypershell/session-core build`

**Step 5: Commit**

```
feat: add runtime DTR/RTS signal control to serial transport
```

---

### Task 6: Register serial IPC in registerIpc.ts and add setSignals handler

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Import and wire up**

Add imports:

```typescript
import { registerSerialProfilesIpc } from "./serialProfilesIpc";
import { createSerialProfilesRepository } from "@hypershell/db";
import { setSignalsRequestSchema } from "@hypershell/shared";
```

Create the repo alongside groupsRepo:

```typescript
const serialProfilesRepo = createSerialProfilesRepository();
```

Add serial profile channels to `registeredChannels`:

```typescript
ipcChannels.serialProfiles.list,
ipcChannels.serialProfiles.upsert,
ipcChannels.serialProfiles.remove,
ipcChannels.serialProfiles.listPorts,
ipcChannels.session.setSignals,
```

In `registerIpc()`, add the call:

```typescript
registerSerialProfilesIpc(ipcMain, () => serialProfilesRepo);
```

Add setSignals handler alongside other session handlers:

```typescript
ipcMain.handle(ipcChannels.session.setSignals, (_event, request) => {
  const parsed = setSignalsRequestSchema.parse(request);
  manager.setSignals(parsed.sessionId, parsed.signals);
});
```

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/desktop build`

**Step 3: Commit**

```
feat: register serial profile IPC handlers and setSignals
```

---

### Task 7: Extend preload API with serial methods

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`

**Step 1: Add imports**

Add to the import from `@hypershell/shared`:

```typescript
upsertSerialProfileRequestSchema,
removeSerialProfileRequestSchema,
setSignalsRequestSchema,
type SerialProfileRecord,
type UpsertSerialProfileRequest,
type RemoveSerialProfileRequest,
type SerialPortInfo,
type SetSignalsRequest,
```

**Step 2: Extend DesktopApi interface**

Add these methods:

```typescript
listSerialProfiles(): Promise<SerialProfileRecord[]>;
upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord>;
removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void>;
listSerialPorts(): Promise<SerialPortInfo[]>;
setSessionSignals(request: SetSignalsRequest): Promise<void>;
```

**Step 3: Implement in createDesktopApi**

Follow the existing host pattern:

```typescript
async listSerialProfiles(): Promise<SerialProfileRecord[]> {
  const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.list);
  return result as SerialProfileRecord[];
},
async upsertSerialProfile(request: UpsertSerialProfileRequest): Promise<SerialProfileRecord> {
  const parsed = upsertSerialProfileRequestSchema.parse(request);
  const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.upsert, parsed);
  return result as SerialProfileRecord;
},
async removeSerialProfile(request: RemoveSerialProfileRequest): Promise<void> {
  const parsed = removeSerialProfileRequestSchema.parse(request);
  await ipcRenderer.invoke(ipcChannels.serialProfiles.remove, parsed);
},
async listSerialPorts(): Promise<SerialPortInfo[]> {
  const result = await ipcRenderer.invoke(ipcChannels.serialProfiles.listPorts);
  return result as SerialPortInfo[];
},
async setSessionSignals(request: SetSignalsRequest): Promise<void> {
  const parsed = setSignalsRequestSchema.parse(request);
  await ipcRenderer.invoke(ipcChannels.session.setSignals, parsed);
}
```

**Step 4: Verify build**

Run: `pnpm --filter @hypershell/desktop build`

**Step 5: Commit**

```
feat: expose serial profile CRUD, port enumeration, and signal control in preload API
```

---

### Task 8: Update window.hypershell global type

**Files:**
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add serial types to imports**

```typescript
import type {
  // ... existing imports ...
  SerialProfileRecord,
  UpsertSerialProfileRequest,
  RemoveSerialProfileRequest,
  SerialPortInfo,
  SetSignalsRequest,
} from "@hypershell/shared";
```

**Step 2: Add methods to Window.hypershell**

```typescript
listSerialProfiles?: () => Promise<SerialProfileRecord[]>;
upsertSerialProfile?: (request: UpsertSerialProfileRequest) => Promise<SerialProfileRecord>;
removeSerialProfile?: (request: RemoveSerialProfileRequest) => Promise<void>;
listSerialPorts?: () => Promise<SerialPortInfo[]>;
setSessionSignals?: (request: SetSignalsRequest) => Promise<void>;
```

**Step 3: Commit**

```
feat: add serial profile methods to window.hypershell type
```

---

### Task 9: Expand SerialProfileForm with all config fields

**Files:**
- Modify: `apps/ui/src/features/serial/SerialProfileForm.tsx`

**Step 1: Rewrite the form with all fields**

Follow the `HostForm.tsx` pattern exactly (Tailwind classes, `inputClasses`, `useEffect` for initialValue sync). Add:

- Name (text input)
- Port path (text input with optional dropdown from `availablePorts` prop)
- Baud rate (select: 300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200)
- Data bits (select: 5, 6, 7, 8)
- Stop bits (select: 1, 2)
- Parity (select: none, even, odd, mark, space)
- Flow control (select: none, hardware, software)
- Local echo (checkbox)
- DTR (checkbox)
- RTS (checkbox)

Add props: `submitLabel?: string`, `availablePorts?: string[]`, `onRefreshPorts?: () => void`.

Use two-column grid for related pairs (baud/data bits, stop bits/parity, flow control row, DTR/RTS row).

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/ui build`

**Step 3: Commit**

```
feat: expand serial profile form with all configuration fields
```

---

### Task 10: Create SerialProfilesView (list + form)

**Files:**
- Create: `apps/ui/src/features/serial/SerialProfilesView.tsx`

**Step 1: Create the view component**

Follow `HostsView.tsx` pattern. Props: none (manages own state). Contains:

- Header with "Serial Profiles" title and "New profile" button
- Two-column layout: profile list (left) + form (right)
- Profile list items showing name, path, baud rate
- Selected profile loads into form for editing
- Delete button on selected profile

State:
```typescript
const [profiles, setProfiles] = useState<SerialProfileRecord[]>([]);
const [selectedId, setSelectedId] = useState<string>("");
const [availablePorts, setAvailablePorts] = useState<string[]>([]);
```

Load profiles from `window.hypershell.listSerialProfiles()` on mount.

On form submit: call `window.hypershell.upsertSerialProfile()` and update local state.

On delete: call `window.hypershell.removeSerialProfile()` and update local state.

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/ui build`

**Step 3: Commit**

```
feat: add serial profiles management view
```

---

### Task 11: Add serial profiles to sidebar

**Files:**
- Modify: `apps/ui/src/features/sidebar/Sidebar.tsx`
- Create: `apps/ui/src/features/sidebar/SidebarSerialList.tsx`

**Step 1: Create SidebarSerialList**

Follow `SidebarHostList.tsx` pattern. Shows serial profiles with name, path, baud rate. Double-click to connect, single-click to edit. Use a serial/plug icon instead of status dot.

**Step 2: Extend Sidebar props and add Serial Profiles section**

Add props:
```typescript
serialProfiles: SerialProfileRecord[];
onConnectSerial: (profile: SerialProfileRecord) => void;
onEditSerial: (profile: SerialProfileRecord) => void;
onNewSerial: () => void;
```

Add a new `SidebarSection` titled "Serial" below hosts with add button and SidebarSerialList.

**Step 3: Verify build**

Run: `pnpm --filter @hypershell/ui build`

**Step 4: Commit**

```
feat: add serial profiles section to sidebar
```

---

### Task 12: Wire serial profiles into App.tsx

**Files:**
- Modify: `apps/ui/src/app/App.tsx`

**Step 1: Add serial profile state and loading**

Add state:
```typescript
const [serialProfiles, setSerialProfiles] = useState<SerialProfileRecord[]>([]);
const [serialModalOpen, setSerialModalOpen] = useState(false);
const [editingSerial, setEditingSerial] = useState<SerialProfileRecord | null>(null);
const [availablePorts, setAvailablePorts] = useState<string[]>([]);
```

Add loader function `loadSerialProfiles()` following `loadHosts()` pattern. Call on mount.

Add `persistSerialProfile()` following `persistHost()` pattern.

**Step 2: Add connectSerial callback**

```typescript
const connectSerial = useCallback((profile: SerialProfileRecord) => {
  const sessionId = `serial-${profile.id}-${Date.now()}`;
  openTab({
    tabKey: sessionId,
    sessionId,
    title: profile.name,
    transport: "serial",
    profileId: profile.id,
    preopened: false
  });
}, [openTab]);
```

**Step 3: Include serial profiles in QuickConnect profiles**

Merge host profiles and serial profiles:

```typescript
const profiles = useMemo<QuickConnectProfile[]>(() => [
  ...hosts.map(h => ({ /* existing host mapping */ })),
  ...serialProfiles.map(sp => ({
    id: sp.id,
    label: sp.name,
    hostname: sp.path,
    transport: "serial" as const,
    description: `${sp.baudRate} baud`
  }))
], [hosts, serialProfiles]);
```

**Step 4: Update QuickConnect onOpenProfile**

Handle serial profiles:
```typescript
onOpenProfile={(profile) => {
  if (profile.transport === "serial") {
    const sp = serialProfiles.find(s => s.id === profile.id);
    if (sp) connectSerial(sp);
  } else {
    const host = hosts.find(h => h.id === profile.id);
    if (host) connectHost(host);
  }
}}
```

**Step 5: Pass serial props to Sidebar**

Add the new props to `<Sidebar>`.

**Step 6: Add serial profile modal**

Add `<Modal>` with `<SerialProfileForm>` for new/edit serial profiles, following the host modal pattern.

**Step 7: Verify build**

Run: `pnpm --filter @hypershell/ui build`

**Step 8: Commit**

```
feat: wire serial profiles into App with sidebar, quick connect, and CRUD modal
```

---

### Task 13: Resolve serial profile to serialOptions in session open

**Files:**
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Resolve serial profile in openSessionHandler**

The current `openSessionHandler` resolves SSH host profiles via `resolveHostProfile`. Add similar logic for serial:

In `registerIpc`, pass the serial profiles repo. In `openSessionHandler`, when `transport === "serial"`, look up the profile by `profileId` from the serial profiles repo and pass the fields as `serialOptions`.

```typescript
if (parsed.transport === "serial") {
  const repo = getSerialProfilesRepo?.();
  const profile = repo?.get(parsed.profileId);
  if (profile) {
    serialOptions = {
      path: profile.path,
      baudRate: profile.baudRate,
      dataBits: profile.dataBits,
      stopBits: profile.stopBits,
      parity: profile.parity,
      flowControl: profile.flowControl,
      localEcho: profile.localEcho,
      dtr: profile.dtr,
      rts: profile.rts
    };
  }
}
```

Pass `serialOptions` to `manager.open()`.

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/desktop build`

**Step 3: Commit**

```
feat: resolve serial profile settings when opening serial sessions
```

---

### Task 14: Add DTR/RTS toggle to terminal pane for serial sessions

**Files:**
- Modify: `apps/ui/src/features/terminal/TerminalPane.tsx`

**Step 1: Add signal toggle buttons**

When `transport === "serial"` and `session.state === "connected"`, show DTR and RTS toggle buttons in the terminal header bar (right side, next to the state label):

```typescript
{transport === "serial" && session.state === "connected" && (
  <div className="flex items-center gap-1.5">
    <button
      onClick={() => {
        setDtr(d => {
          const next = !d;
          window.hypershell?.setSessionSignals?.({ sessionId: session.sessionId!, signals: { dtr: next } });
          return next;
        });
      }}
      className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border transition-all duration-150 ${
        dtr
          ? "bg-success/15 text-success border-success/30"
          : "bg-base-700/60 text-text-muted border-border/40"
      }`}
    >
      DTR
    </button>
    <button /* same pattern for RTS */ />
  </div>
)}
```

Add local state `dtr` and `rts` (default `true` matching transport defaults).

**Step 2: Verify build**

Run: `pnpm --filter @hypershell/ui build`

**Step 3: Commit**

```
feat: add DTR/RTS toggle buttons to serial terminal pane header
```

---

### Task 15: Run full build and tests

**Step 1: Build all**

Run: `pnpm build`

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Fix any issues**

**Step 4: Commit any fixes**

```
fix: resolve build/test issues from serial profile implementation
```
