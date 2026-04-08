# 1Password Vault Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 3-step modal picker (vault → item → field) that lets users browse their 1Password vault and auto-constructs an `op://vault/item/field` reference.

**Architecture:** Three new IPC channels call the `op` CLI to list vaults, items, and fields. A new React modal component presents each step with search filtering and breadcrumb navigation. The picker is triggered from a browse button in the host form's op-reference section.

**Tech Stack:** Electron IPC + `op` CLI (child_process), React + Framer Motion modal, Zod schemas, Zustand (none needed — local component state).

---

### Task 1: Add IPC channels and Zod schemas

**Files:**
- Modify: `packages/shared/src/ipc/channels.ts:108-129`
- Modify: `packages/shared/src/ipc/schemas.ts` (append)

**Step 1: Add channel constants**

In `packages/shared/src/ipc/channels.ts`, add before the `ipcChannels` export (before line 114):

```typescript
export const opChannels = {
  listVaults: "op:list-vaults",
  listItems: "op:list-items",
  getItemFields: "op:get-item-fields",
} as const;
```

Then add `op: opChannels,` to the `ipcChannels` object (after `network: networkChannels,`).

**Step 2: Add Zod schemas**

Append to `packages/shared/src/ipc/schemas.ts`:

```typescript
// 1Password vault picker
export const opVaultSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type OpVault = z.infer<typeof opVaultSchema>;

export const opListVaultsResponseSchema = z.array(opVaultSchema);
export type OpListVaultsResponse = z.infer<typeof opListVaultsResponseSchema>;

export const opItemSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
});
export type OpItemSummary = z.infer<typeof opItemSummarySchema>;

export const opListItemsRequestSchema = z.object({
  vaultId: z.string().min(1),
});
export type OpListItemsRequest = z.infer<typeof opListItemsRequestSchema>;

export const opListItemsResponseSchema = z.array(opItemSummarySchema);
export type OpListItemsResponse = z.infer<typeof opListItemsResponseSchema>;

export const opFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string().optional(),
});
export type OpField = z.infer<typeof opFieldSchema>;

export const opGetItemFieldsRequestSchema = z.object({
  itemId: z.string().min(1),
});
export type OpGetItemFieldsRequest = z.infer<typeof opGetItemFieldsRequestSchema>;

export const opGetItemFieldsResponseSchema = z.array(opFieldSchema);
export type OpGetItemFieldsResponse = z.infer<typeof opGetItemFieldsResponseSchema>;
```

**Step 3: Run build to verify schemas compile**

Run: `pnpm --filter @sshterm/shared build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add packages/shared/src/ipc/channels.ts packages/shared/src/ipc/schemas.ts
git commit -m "feat: add IPC channels and schemas for 1Password vault picker"
```

---

### Task 2: Add IPC handler for `op` CLI

**Files:**
- Create: `apps/desktop/src/main/ipc/opIpc.ts`
- Create: `apps/desktop/src/main/ipc/opIpc.test.ts`
- Modify: `apps/desktop/src/main/ipc/registerIpc.ts`

**Step 1: Write the test**

Create `apps/desktop/src/main/ipc/opIpc.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { registerOpIpc } from "./opIpc";

function createMockIpcMain() {
  const handlers = new Map<string, Function>();
  return {
    handle(channel: string, handler: Function) {
      handlers.set(channel, handler);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for ${channel}`);
      return handler({}, ...args);
    },
  };
}

// We mock execFile to avoid needing real `op` CLI in tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:util", () => ({
  promisify: (fn: Function) => fn,
}));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

describe("opIpc", () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>;

  beforeEach(() => {
    ipcMain = createMockIpcMain();
    vi.clearAllMocks();
    registerOpIpc(ipcMain as any);
  });

  it("lists vaults", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ id: "abc", name: "Personal" }]),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:list-vaults");
    expect(result).toEqual([{ id: "abc", name: "Personal" }]);
  });

  it("lists items for a vault", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ id: "item1", title: "Server Login", category: "LOGIN" }]),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:list-items", { vaultId: "abc" });
    expect(result).toEqual([{ id: "item1", title: "Server Login", category: "LOGIN" }]);
  });

  it("gets fields for an item", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        fields: [
          { id: "f1", label: "username", type: "STRING", value: "admin" },
          { id: "f2", label: "password", type: "CONCEALED", value: "secret" },
        ],
      }),
      stderr: "",
    } as any);

    const result = await ipcMain.invoke("op:get-item-fields", { itemId: "item1" });
    expect(result).toEqual([
      { id: "f1", label: "username", type: "STRING" },
      { id: "f2", label: "password", type: "CONCEALED" },
    ]);
  });

  it("throws when op CLI is not found", async () => {
    const err = new Error("spawn op ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFile.mockRejectedValue(err);

    await expect(ipcMain.invoke("op:list-vaults")).rejects.toThrow(
      /1Password CLI.*not found/i
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @sshterm/desktop test -- opIpc`
Expected: FAIL — `registerOpIpc` does not exist

**Step 3: Write the handler**

Create `apps/desktop/src/main/ipc/opIpc.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ipcChannels,
  opListItemsRequestSchema,
  opGetItemFieldsRequestSchema,
} from "@sshterm/shared";
import type { IpcMainLike } from "./registerIpc";
import type { IpcMainInvokeEvent } from "electron";

const execFileAsync = promisify(execFile);

async function runOp(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("op", args, {
      windowsHide: true,
    });
    return stdout;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      throw new Error(
        "1Password CLI (op) not found. Install it from https://1password.com/downloads/command-line/"
      );
    }
    throw err;
  }
}

export function registerOpIpc(ipcMain: IpcMainLike): void {
  ipcMain.handle(ipcChannels.op.listVaults, async () => {
    const raw = await runOp(["vault", "list", "--format=json"]);
    const parsed = JSON.parse(raw) as { id: string; name: string }[];
    return parsed.map((v) => ({ id: v.id, name: v.name }));
  });

  ipcMain.handle(
    ipcChannels.op.listItems,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const { vaultId } = opListItemsRequestSchema.parse(request);
      const raw = await runOp(["item", "list", `--vault=${vaultId}`, "--format=json"]);
      const parsed = JSON.parse(raw) as { id: string; title: string; category?: string }[];
      return parsed.map((i) => ({ id: i.id, title: i.title, category: i.category }));
    }
  );

  ipcMain.handle(
    ipcChannels.op.getItemFields,
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      const { itemId } = opGetItemFieldsRequestSchema.parse(request);
      const raw = await runOp(["item", "get", itemId, "--format=json"]);
      const parsed = JSON.parse(raw) as {
        fields?: { id: string; label: string; type?: string }[];
      };
      const fields = parsed.fields ?? [];
      // Filter out internal/section-only fields (no label = not user-facing)
      return fields
        .filter((f) => f.label)
        .map((f) => ({ id: f.id, label: f.label, type: f.type }));
    }
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @sshterm/desktop test -- opIpc`
Expected: PASS

**Step 5: Register the handler**

In `apps/desktop/src/main/ipc/registerIpc.ts`:

1. Add import at the top (after line 35): `import { registerOpIpc } from "./opIpc";`

2. Add channels to `registeredChannels` array (after line 119, before `] as const`):
```typescript
  ipcChannels.op.listVaults,
  ipcChannels.op.listItems,
  ipcChannels.op.getItemFields,
```

3. Add registration call (after `registerSshKeysIpc(ipcMain);` on line 931):
```typescript
  registerOpIpc(ipcMain);
```

**Step 6: Run build to verify**

Run: `pnpm --filter @sshterm/desktop build`
Expected: SUCCESS

**Step 7: Commit**

```bash
git add apps/desktop/src/main/ipc/opIpc.ts apps/desktop/src/main/ipc/opIpc.test.ts apps/desktop/src/main/ipc/registerIpc.ts
git commit -m "feat: add IPC handler for 1Password CLI vault/item/field listing"
```

---

### Task 3: Wire preload and global types

**Files:**
- Modify: `apps/desktop/src/preload/desktopApi.ts`
- Modify: `apps/ui/src/types/global.d.ts`

**Step 1: Add to preload DesktopApi interface**

In `apps/desktop/src/preload/desktopApi.ts`, find the `DesktopApi` interface (around line 215-230) and add:

```typescript
  opListVaults(): Promise<OpListVaultsResponse>;
  opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse>;
  opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse>;
```

Add the imports at the top:
```typescript
  opListVaultsResponseSchema,
  opListItemsRequestSchema,
  opListItemsResponseSchema,
  opGetItemFieldsRequestSchema,
  opGetItemFieldsResponseSchema,
```

And the types:
```typescript
import type {
  OpListVaultsResponse,
  OpListItemsRequest,
  OpListItemsResponse,
  OpGetItemFieldsRequest,
  OpGetItemFieldsResponse,
} from "@sshterm/shared";
```

**Step 2: Add implementations to createDesktopApi**

In the `createDesktopApi` return object (after the last method, around line 930+):

```typescript
    async opListVaults(): Promise<OpListVaultsResponse> {
      const result = await ipcRenderer.invoke(ipcChannels.op.listVaults);
      return opListVaultsResponseSchema.parse(result);
    },
    async opListItems(request: OpListItemsRequest): Promise<OpListItemsResponse> {
      const parsed = opListItemsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.listItems, parsed);
      return opListItemsResponseSchema.parse(result);
    },
    async opGetItemFields(request: OpGetItemFieldsRequest): Promise<OpGetItemFieldsResponse> {
      const parsed = opGetItemFieldsRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.op.getItemFields, parsed);
      return opGetItemFieldsResponseSchema.parse(result);
    },
```

**Step 3: Add to global.d.ts**

In `apps/ui/src/types/global.d.ts`, add types to the import (line 1-67):

```typescript
  OpListVaultsResponse,
  OpListItemsRequest,
  OpListItemsResponse,
  OpGetItemFieldsRequest,
  OpGetItemFieldsResponse,
```

Add methods to the `Window.sshterm` interface (after `listPortForwards` around line 131):

```typescript
      opListVaults?: () => Promise<OpListVaultsResponse>;
      opListItems?: (request: OpListItemsRequest) => Promise<OpListItemsResponse>;
      opGetItemFields?: (request: OpGetItemFieldsRequest) => Promise<OpGetItemFieldsResponse>;
```

**Step 4: Build to verify**

Run: `pnpm build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add apps/desktop/src/preload/desktopApi.ts apps/ui/src/types/global.d.ts
git commit -m "feat: wire 1Password picker IPC through preload and global types"
```

---

### Task 4: Create the OpPickerModal component

**Files:**
- Create: `apps/ui/src/features/hosts/OpPickerModal.tsx`

**Step 1: Create the modal component**

Create `apps/ui/src/features/hosts/OpPickerModal.tsx`:

```tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { Modal } from "../layout/Modal";

type Step = "vaults" | "items" | "fields";

interface VaultEntry {
  id: string;
  name: string;
}

interface ItemEntry {
  id: string;
  title: string;
  category?: string;
}

interface FieldEntry {
  id: string;
  label: string;
  type?: string;
}

interface OpPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (reference: string) => void;
}

export function OpPickerModal({ open, onClose, onSelect }: OpPickerModalProps) {
  const [step, setStep] = useState<Step>("vaults");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [fields, setFields] = useState<FieldEntry[]>([]);

  const [selectedVault, setSelectedVault] = useState<VaultEntry | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemEntry | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("vaults");
      setSearch("");
      setError(null);
      setSelectedVault(null);
      setSelectedItem(null);
      loadVaults();
    }
  }, [open]);

  const loadVaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.sshterm?.opListVaults?.();
      setVaults(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list vaults");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadItems = useCallback(async (vaultId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.sshterm?.opListItems?.({ vaultId });
      setItems(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list items");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFields = useCallback(async (itemId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.sshterm?.opGetItemFields?.({ itemId });
      setFields(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item fields");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleVaultSelect = (vault: VaultEntry) => {
    setSelectedVault(vault);
    setStep("items");
    setSearch("");
    loadItems(vault.id);
  };

  const handleItemSelect = (item: ItemEntry) => {
    setSelectedItem(item);
    setStep("fields");
    setSearch("");
    loadFields(item.id);
  };

  const handleFieldSelect = (field: FieldEntry) => {
    if (!selectedVault || !selectedItem) return;
    const reference = `op://${selectedVault.name}/${selectedItem.title}/${field.label}`;
    onSelect(reference);
    onClose();
  };

  const handleBack = () => {
    setSearch("");
    setError(null);
    if (step === "fields") {
      setStep("items");
    } else if (step === "items") {
      setStep("vaults");
    }
  };

  const breadcrumb = useMemo(() => {
    const parts: string[] = ["Vaults"];
    if (selectedVault && step !== "vaults") parts.push(selectedVault.name);
    if (selectedItem && step === "fields") parts.push(selectedItem.title);
    return parts.join(" › ");
  }, [step, selectedVault, selectedItem]);

  const title = step === "vaults"
    ? "Select Vault"
    : step === "items"
      ? "Select Item"
      : "Select Field";

  const filterLower = search.toLowerCase();

  const filteredVaults = useMemo(
    () => vaults.filter((v) => v.name.toLowerCase().includes(filterLower)),
    [vaults, filterLower]
  );
  const filteredItems = useMemo(
    () => items.filter((i) => i.title.toLowerCase().includes(filterLower)),
    [items, filterLower]
  );
  const filteredFields = useMemo(
    () => fields.filter((f) => f.label.toLowerCase().includes(filterLower)),
    [fields, filterLower]
  );

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {/* Breadcrumb + Back */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {step !== "vaults" && (
            <button
              onClick={handleBack}
              className="rounded px-1.5 py-0.5 hover:bg-base-700 hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
          )}
          <span>{breadcrumb}</span>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter..."
          autoFocus
          className="w-full rounded-md border border-border bg-base-900 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
        />

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-8 text-center text-xs text-text-muted">Loading…</div>
        )}

        {/* Lists */}
        {!loading && !error && (
          <div className="max-h-64 overflow-y-auto">
            {step === "vaults" &&
              (filteredVaults.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No vaults found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredVaults.map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => handleVaultSelect(v)}
                        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-base-700 transition-colors rounded"
                      >
                        {v.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {step === "items" &&
              (filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No items found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredItems.map((i) => (
                    <li key={i.id}>
                      <button
                        onClick={() => handleItemSelect(i)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-base-700 transition-colors rounded flex items-center justify-between"
                      >
                        <span className="text-text-primary">{i.title}</span>
                        {i.category && (
                          <span className="text-[10px] text-text-muted uppercase tracking-wider">
                            {i.category}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}

            {step === "fields" &&
              (filteredFields.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No fields found</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {filteredFields.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={() => handleFieldSelect(f)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-base-700 transition-colors rounded flex items-center justify-between"
                      >
                        <span className="text-text-primary">{f.label}</span>
                        {f.type && (
                          <span className="text-[10px] text-text-muted uppercase tracking-wider">
                            {f.type}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
```

**Step 2: Build to verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add apps/ui/src/features/hosts/OpPickerModal.tsx
git commit -m "feat: add OpPickerModal component for 1Password vault browsing"
```

---

### Task 5: Integrate picker into HostForm

**Files:**
- Modify: `apps/ui/src/features/hosts/HostForm.tsx:389-403`

**Step 1: Add picker to the op-reference section**

In `apps/ui/src/features/hosts/HostForm.tsx`:

1. Add import at the top:
```typescript
import { OpPickerModal } from "./OpPickerModal";
```

2. Add state inside the component (near other useState declarations):
```typescript
const [opPickerOpen, setOpPickerOpen] = useState(false);
```

3. Replace the op-reference block (lines 389-403) with:

```tsx
        {value.authMethod === "op-reference" && (
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">1Password Reference</span>
            <div className="flex gap-1.5">
              <input
                id={`${formId}-opReference`}
                value={value.opReference}
                onChange={(e) => setValue({ ...value, opReference: e.target.value })}
                placeholder="op://vault/item/field"
                className={`${inputClasses} flex-1`}
              />
              <button
                type="button"
                onClick={() => setOpPickerOpen(true)}
                title="Browse 1Password vault"
                className="shrink-0 rounded-md border border-border bg-base-800 px-2.5 hover:bg-base-700 text-text-muted hover:text-text-primary transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 2a4.5 4.5 0 1 0 2.76 8.05l2.85 2.85a.75.75 0 1 0 1.06-1.06l-2.85-2.85A4.5 4.5 0 0 0 6.5 2ZM3 6.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z" fill="currentColor" />
                </svg>
              </button>
            </div>
            <span className="text-xs text-text-muted/70">
              Enter an <code>op://</code> reference or browse your vault.
            </span>
            <OpPickerModal
              open={opPickerOpen}
              onClose={() => setOpPickerOpen(false)}
              onSelect={(ref) => setValue({ ...value, opReference: ref })}
            />
          </div>
        )}
```

**Step 2: Build to verify**

Run: `pnpm --filter @sshterm/ui build`
Expected: SUCCESS

**Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/ui/src/features/hosts/HostForm.tsx
git commit -m "feat: integrate 1Password picker into host form op-reference field"
```

---

### Task 6: Manual smoke test

**No files changed — verification only.**

**Step 1: Build desktop**

Run: `pnpm --filter @sshterm/desktop build`

**Step 2: Verify in running app**

1. Launch the app
2. Edit a host → set auth method to "1Password Reference"
3. Click the browse (search) button next to the input
4. Modal should open and list your vaults
5. Select a vault → see items listed
6. Select an item → see fields listed
7. Select a field → modal closes, `op://vault/item/field` is populated in the input
8. Verify the back button and search filter work at each step

**Step 3: Test error case**

If you temporarily rename the `op` executable (or test on a machine without it), verify the error message appears: "1Password CLI (op) not found."
