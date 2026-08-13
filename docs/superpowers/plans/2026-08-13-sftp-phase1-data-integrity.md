# SFTP Phase 1: Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SFTP feature incapable of silently losing, corrupting, or stranding user data.

**Architecture:** Five independent defects share three root causes — state owned by a component instead of a store, an editor that discards the encoding the backend already computed, and write paths that are neither atomic nor bounded. Fixes move conflict state into `transferStore`, thread encoding and version metadata through the existing Zod IPC contract, and replace whole-file reads with streams. No new subsystems.

**Tech Stack:** TypeScript (strict, ES2022), React 19 + Zustand (vanilla stores), Zod for all IPC, ssh2 for SFTP, Vitest 3.1, pnpm workspaces.

## Global Constraints

- TypeScript strict mode; target ES2022. No `any` outside test files.
- Every IPC payload is Zod-validated in **both** preload and main. Never widen a schema on one side only.
- `packages/session-core` has zero renderer dependencies — it runs only in the main process.
- After changing main-process or preload code, run `pnpm --filter @hypershell/desktop build` and restart Electron. UI-only changes hot-reload via Vite.
- **Do not run root `pnpm test`** if `better-sqlite3` reports an ABI mismatch on this machine — it is a known local breakage unrelated to your change. Run scoped workspace tests instead: `pnpm --filter @hypershell/ui test`, `pnpm --filter @hypershell/desktop test`, `pnpm --filter @hypershell/session-core test`, `pnpm --filter @hypershell/shared test`.
- Match surrounding style: double quotes, 2-space indent, no semicolon omission.
- Commit after every task. Never mix two tasks in one commit.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `apps/ui/src/features/sftp/transferStore.ts` | Owns transfer + conflict state | Modify |
| `apps/ui/src/features/sftp/transferEventCoordinator.ts` | Sole writer of transfer state from events | Modify |
| `apps/ui/src/features/sftp/components/TransferConflictActions.tsx` | Shared conflict-resolution row | Create |
| `apps/ui/src/features/sftp/components/TransferPopup.tsx` | Floating monitor | Modify |
| `apps/ui/src/features/sftp/components/TransferPanel.tsx` | Default inline monitor | Modify |
| `apps/desktop/src/main/ipc/sftpIpc.ts` | Encoding classification, version check | Modify |
| `packages/shared/src/ipc/sftpSchemas.ts` | Read/write file contract | Modify |
| `apps/ui/src/features/editor/stores/editorStore.ts` | Editor tab state | Modify |
| `apps/ui/src/features/editor/EditorApp.tsx` | Open/save orchestration | Modify |
| `apps/ui/src/features/editor/components/SaveConflictDialog.tsx` | Remote-changed resolution | Create |
| `packages/session-core/src/transports/sftpTransport.ts` | Atomic write + rename fallback | Modify |
| `packages/session-core/src/sftp/syncEngine.ts` | Streaming download, error isolation | Modify |
| `apps/ui/src/features/sftp/components/RemotePane.tsx` | Remote listing | Modify |
| `apps/ui/src/features/sftp/components/LocalPane.tsx` | Local listing | Modify |

---

### Task 1: Conflict state and attention count in `transferStore`

**Files:**
- Modify: `apps/ui/src/features/sftp/transferStore.ts`
- Test: `apps/ui/src/features/sftp/transferStore.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `TransferStoreState.conflictIds: ReadonlySet<string>`, `TransferStoreState.attentionCount: number`, `setConflict(transferId: string): void`, `clearConflict(transferId: string): void`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/ui/src/features/sftp/transferStore.test.ts`:

```ts
describe("attentionCount", () => {
  it("counts paused transfers so a conflict cannot strand the panel", () => {
    const store = createTransferStore();
    store.getState().setTransfers([
      { transferId: "a", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 5, totalBytes: 10, speed: 0, status: "paused" } as never
    ]);

    expect(store.getState().activeCount).toBe(0);
    expect(store.getState().attentionCount).toBe(1);
  });

  it("ignores completed and failed transfers", () => {
    const store = createTransferStore();
    store.getState().setTransfers([
      { transferId: "a", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 10, totalBytes: 10, speed: 0, status: "completed" } as never,
      { transferId: "b", sftpSessionId: "s", type: "upload", localPath: "/l", remotePath: "/r",
        bytesTransferred: 1, totalBytes: 10, speed: 0, status: "failed" } as never
    ]);

    expect(store.getState().attentionCount).toBe(0);
  });
});

describe("conflict tracking", () => {
  it("records and clears conflict ids", () => {
    const store = createTransferStore();

    store.getState().setConflict("a");
    expect(store.getState().conflictIds.has("a")).toBe(true);

    store.getState().clearConflict("a");
    expect(store.getState().conflictIds.has("a")).toBe(false);
  });

  it("keeps the same Set reference when clearing an unknown id", () => {
    const store = createTransferStore();
    const before = store.getState().conflictIds;

    store.getState().clearConflict("missing");

    expect(store.getState().conflictIds).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- transferStore`
Expected: FAIL — `attentionCount` is undefined, `setConflict is not a function`.

- [ ] **Step 3: Implement**

In `apps/ui/src/features/sftp/transferStore.ts`, add the predicate next to `deriveActiveCount` (line 26) and replace `hasRunningTransfers`' body to reuse it:

```ts
function needsAttention(transfer: TransferJob): boolean {
  return (
    transfer.status === "queued"
    || transfer.status === "active"
    || transfer.status === "paused"
    || transfer.status === "interrupted"
  );
}

function deriveAttentionCount(transfers: TransferJob[]): number {
  return transfers.filter(needsAttention).length;
}

function hasRunningTransfers(transfers: TransferJob[]): boolean {
  return transfers.some(needsAttention);
}
```

Add to `TransferStoreState` (after `activeCount: number;`):

```ts
  attentionCount: number;
  conflictIds: ReadonlySet<string>;
```

and to the action block (after `updateTransfer`):

```ts
  setConflict: (transferId: string) => void;
  clearConflict: (transferId: string) => void;
```

In `createTransferStore`, add initial state after `activeCount: 0,`:

```ts
    attentionCount: 0,
    conflictIds: new Set<string>(),
```

Add `attentionCount: deriveAttentionCount(nextTransfers),` to the object returned by `setTransfers` and `attentionCount: deriveAttentionCount(transfers),` to the one returned by `updateTransfer`, alongside the existing `activeCount` lines.

Add the two actions before `setFilter`:

```ts
    setConflict: (transferId) =>
      set((state) => {
        if (state.conflictIds.has(transferId)) {
          return {};
        }
        const next = new Set(state.conflictIds);
        next.add(transferId);
        return { conflictIds: next };
      }),

    clearConflict: (transferId) =>
      set((state) => {
        if (!state.conflictIds.has(transferId)) {
          return {};
        }
        const next = new Set(state.conflictIds);
        next.delete(transferId);
        return { conflictIds: next };
      }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- transferStore`
Expected: PASS, including the pre-existing tests in that file.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/transferStore.ts apps/ui/src/features/sftp/transferStore.test.ts
git commit -m "feat(sftp): track conflicts and attention count in transfer store"
```

---

### Task 2: Coordinator owns the conflict lifecycle

**Files:**
- Modify: `apps/ui/src/features/sftp/transferEventCoordinator.ts`
- Test: `apps/ui/src/features/sftp/transferEventCoordinator.test.ts`

**Interfaces:**
- Consumes: `setConflict`, `clearConflict` from Task 1.
- Produces: guarantee that `transferStore.conflictIds` reflects the live event stream regardless of which components are mounted.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("transferEventCoordinator", ...)` block in `apps/ui/src/features/sftp/transferEventCoordinator.test.ts`:

```ts
it("records a conflict in the store, not in a component", () => {
  const stop = startTransferEventCoordinator();

  bridgeListeners[0]({
    kind: "transfer-conflict",
    sftpSessionId: "s1",
    transferId: "t1",
    remotePath: "/r/f",
    localPath: "/l/f",
    type: "upload"
  } as SftpEvent);

  expect(transferStore.getState().conflictIds.has("t1")).toBe(true);
  stop();
});

it("clears the conflict once the transfer makes progress again", () => {
  const stop = startTransferEventCoordinator();

  bridgeListeners[0]({
    kind: "transfer-conflict",
    sftpSessionId: "s1",
    transferId: "t1",
    remotePath: "/r/f",
    localPath: "/l/f",
    type: "upload"
  } as SftpEvent);

  bridgeListeners[0]({
    kind: "transfer-progress",
    transferId: "t1",
    bytesTransferred: 1,
    totalBytes: 10,
    speed: 1,
    status: "active"
  } as SftpEvent);

  expect(transferStore.getState().conflictIds.has("t1")).toBe(false);
  stop();
});

it("clears the conflict when the transfer completes", () => {
  const stop = startTransferEventCoordinator();

  bridgeListeners[0]({
    kind: "transfer-conflict",
    sftpSessionId: "s1",
    transferId: "t1",
    remotePath: "/r/f",
    localPath: "/l/f",
    type: "upload"
  } as SftpEvent);

  bridgeListeners[0](completedEvent("s1", "t1"));

  expect(transferStore.getState().conflictIds.has("t1")).toBe(false);
  stop();
});
```

Add to the existing `beforeEach`, after `transferStore.getState().setTransfers([]);`:

```ts
    for (const id of [...transferStore.getState().conflictIds]) {
      transferStore.getState().clearConflict(id);
    }
```

> If the `transfer-conflict` event shape in `packages/shared/src/ipc/sftpSchemas.ts` differs from the fields above, use the real one — only `kind` and `transferId` matter to these assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- transferEventCoordinator`
Expected: FAIL — `conflictIds.has("t1")` is `false` after the conflict event.

- [ ] **Step 3: Implement**

In `handleSftpEvent`, in the `transfer-progress` branch, add immediately after `const state = transferStore.getState();`:

```ts
    state.clearConflict(event.transferId);
```

Replace the `transfer-conflict` branch body with:

```ts
  if (event.kind === "transfer-conflict") {
    const state = transferStore.getState();
    state.setConflict(event.transferId);
    state.setPanelOpen(true);
    void refreshTransfers();
    notifyTransferEvent(event);
    return;
  }
```

In the `transfer-complete` branch, add immediately after `const state = transferStore.getState();`:

```ts
    state.clearConflict(event.transferId);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- transferEventCoordinator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/transferEventCoordinator.ts apps/ui/src/features/sftp/transferEventCoordinator.test.ts
git commit -m "feat(sftp): move conflict lifecycle into the event coordinator"
```

---

### Task 3: Extract `TransferConflictActions` and adopt it in `TransferPopup`

**Files:**
- Create: `apps/ui/src/features/sftp/components/TransferConflictActions.tsx`
- Modify: `apps/ui/src/features/sftp/components/TransferPopup.tsx`
- Test: `apps/ui/src/features/sftp/components/TransferConflictActions.test.tsx`

**Interfaces:**
- Consumes: `conflictIds` from Task 1.
- Produces: `<TransferConflictActions transferId={string} onResolve={(transferId: string, resolution: "overwrite" | "skip" | "rename", applyToAll: boolean) => void} />`

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/features/sftp/components/TransferConflictActions.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TransferConflictActions } from "./TransferConflictActions";

describe("TransferConflictActions", () => {
  it("offers every resolution and reports which was chosen", async () => {
    const onResolve = vi.fn();
    render(<TransferConflictActions transferId="t1" onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "overwrite", false);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "skip", false);

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "rename", false);
  });

  it("marks the apply-to-all variants distinctly", async () => {
    const onResolve = vi.fn();
    render(<TransferConflictActions transferId="t1" onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Overwrite all" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "overwrite", true);

    await userEvent.click(screen.getByRole("button", { name: "Skip all" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "skip", true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- TransferConflictActions`
Expected: FAIL — cannot resolve `./TransferConflictActions`.

- [ ] **Step 3: Implement the component**

Create `apps/ui/src/features/sftp/components/TransferConflictActions.tsx`:

```tsx
export type TransferConflictResolution = "overwrite" | "skip" | "rename";

export interface TransferConflictActionsProps {
  transferId: string;
  onResolve: (
    transferId: string,
    resolution: TransferConflictResolution,
    applyToAll: boolean
  ) => void;
}

const SINGLE_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite", resolution: "overwrite" },
  { label: "Skip", resolution: "skip" },
  { label: "Rename", resolution: "rename" }
];

const ALL_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite all", resolution: "overwrite" },
  { label: "Skip all", resolution: "skip" }
];

/**
 * Conflict resolution row shared by both transfer monitors. The popup and the
 * inline panel must offer identical choices — a conflict raised while one is
 * hidden has to stay resolvable in the other.
 */
export function TransferConflictActions({ transferId, onResolve }: TransferConflictActionsProps) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-amber-200/70">File exists:</span>

      {SINGLE_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100"
          onClick={() => onResolve(transferId, resolution, false)}
        >
          {label}
        </button>
      ))}

      <span className="mx-0.5 text-[9px] text-text-secondary/50">|</span>

      {ALL_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="rounded border border-amber-400/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-200/70 transition-colors hover:border-amber-400/30 hover:text-amber-100"
          onClick={() => onResolve(transferId, resolution, true)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

> Colours and sizes are copied verbatim from the current popup markup. Phase 3 revisits them; do not change them here.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- TransferConflictActions`
Expected: PASS.

- [ ] **Step 5: Adopt it in `TransferPopup` and delete the local conflict state**

In `apps/ui/src/features/sftp/components/TransferPopup.tsx`:

1. Add the import: `import { TransferConflictActions } from "./TransferConflictActions";`
2. Delete the `conflictIds` `useState` (line 376) and the entire `useEffect` that calls `subscribeToTransferEvents` (lines 383–397).
3. Read conflicts from the store instead — add beside the other `useStore` calls:

```tsx
  const conflictIds = useStore(transferStore, (state) => state.conflictIds);
```

4. Remove `subscribeToTransferEvents` from the import on line 9, leaving `import { refreshTransfers } from "../transferEventCoordinator";`
5. In `resolveConflict`, delete the `setConflictIds(...)` block — the coordinator now clears it when the backend responds. The body becomes:

```tsx
  const resolveConflict = useCallback(
    (transferId: string, resolution: "overwrite" | "skip" | "rename", applyToAll: boolean) => {
      void (async () => {
        try {
          await window.hypershell?.sftpTransferResolveConflict?.({
            transferId,
            resolution,
            applyToAll
          });
        } catch (error) {
          toast.error(toErrorMessage(error, "Failed to resolve conflict"));
        } finally {
          void refreshTransfers();
        }
      })();
    },
    []
  );
```

6. In `TransferRow`, replace the inline conflict markup (the `hasConflict ? (...)` branch, lines 230–269) with:

```tsx
          {hasConflict ? (
            <TransferConflictActions transferId={transfer.transferId} onResolve={onResolveConflict} />
          ) : (
```

leaving the existing `) : (` progress branch and its closing `)}` untouched.

- [ ] **Step 6: Verify the suite still passes**

Run: `pnpm --filter @hypershell/ui test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/features/sftp/components/TransferConflictActions.tsx apps/ui/src/features/sftp/components/TransferConflictActions.test.tsx apps/ui/src/features/sftp/components/TransferPopup.tsx
git commit -m "refactor(sftp): share conflict actions and read conflicts from the store"
```

---

### Task 4: Make the default `TransferPanel` conflict-capable and always reachable

**Files:**
- Modify: `apps/ui/src/features/sftp/components/TransferPanel.tsx`
- Test: `apps/ui/src/features/sftp/components/TransferPanel.test.tsx`

**Interfaces:**
- Consumes: `attentionCount`, `conflictIds` (Task 1), `<TransferConflictActions>` (Task 3).
- Produces: nothing downstream.

This task closes the actual reported bug: with `usePopupTransferMonitor` defaulting to `false` (settingsStore.ts:146), this panel is what most users see.

- [ ] **Step 1: Write the failing tests**

Create `apps/ui/src/features/sftp/components/TransferPanel.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { transferStore } from "../transferStore";
import { TransferPanel } from "./TransferPanel";

function pausedTransfer(transferId: string, userInitiated: boolean) {
  return {
    transferId,
    sftpSessionId: "s1",
    type: "upload",
    localPath: "/l/f",
    remotePath: "/r/f",
    bytesTransferred: 5,
    totalBytes: 10,
    speed: 0,
    status: "paused",
    userInitiated
  } as never;
}

describe("TransferPanel", () => {
  beforeEach(() => {
    transferStore.getState().setTransfers([]);
    for (const id of [...transferStore.getState().conflictIds]) {
      transferStore.getState().clearConflict(id);
    }
    transferStore.getState().setPanelOpen(true);
  });

  it("offers conflict resolution for a conflicted transfer", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);
    transferStore.getState().setConflict("t1");

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: "Overwrite" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("does not offer Resume for a transfer paused by the system", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);

    render(<TransferPanel />);

    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it("offers Resume for a transfer the user paused", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", true)]);

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("stays reachable after closing while a paused transfer remains", () => {
    transferStore.getState().setTransfers([pausedTransfer("t1", false)]);
    transferStore.getState().setPanelOpen(false);

    render(<TransferPanel />);

    expect(screen.getByRole("button", { name: /Transfers/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/ui test -- TransferPanel`
Expected: FAIL — no conflict buttons exist; `Resume` renders for a system-paused transfer; the reopen affordance is absent because `activeCount` is 0.

- [ ] **Step 3: Implement**

In `apps/ui/src/features/sftp/components/TransferPanel.tsx`:

1. Add imports:

```tsx
import { TransferConflictActions } from "./TransferConflictActions";
```

2. Replace the `activeCount` subscription with the attention count, and add conflicts:

```tsx
  const attentionCount = useStore(transferStore, (state) => state.attentionCount);
  const conflictIds = useStore(transferStore, (state) => state.conflictIds);
```

(Keep `activeCount` only if still referenced for the label; the collapsed button below uses `attentionCount`.)

3. Add a resolve handler beside the existing action handlers:

```tsx
  const resolveConflict = (
    transferId: string,
    resolution: "overwrite" | "skip" | "rename",
    applyToAll: boolean
  ) => {
    void (async () => {
      try {
        await window.hypershell?.sftpTransferResolveConflict?.({
          transferId,
          resolution,
          applyToAll
        });
      } catch (error) {
        toast.error(toErrorMessage(error, "Failed to resolve conflict"));
      }
    })();
  };
```

4. Replace the collapsed-affordance block (lines 96–106) so closing the panel can never strand work:

```tsx
  if (!panelOpen) {
    return attentionCount > 0 ? (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-2 border-t border-base-700 bg-base-900 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
      >
        Transfers ({attentionCount} need attention)
      </button>
    ) : null;
  }
```

5. Inside the row `map`, compute the conflict flag immediately after the opening of the callback:

```tsx
          filteredTransfers.map((transfer) => {
            const hasConflict = conflictIds.has(transfer.transferId);
            return (
```

and close it with `);\n          })` instead of `))`.

6. Replace the paused-Resume button (lines 222–232) so it matches the popup's `userInitiated` gate:

```tsx
                  {transfer.status === "paused" && transfer.userInitiated === true && (
                    <button
                      type="button"
                      className="text-xs text-text-secondary hover:text-emerald-300"
                      onClick={() => {
                        void resumeTransfer(transfer.transferId);
                      }}
                    >
                      Resume
                    </button>
                  )}
```

7. Render the conflict row. Immediately before the `{(transfer.status === "active" || transfer.status === "queued" || transfer.status === "paused") && (` block, insert:

```tsx
              {hasConflict && (
                <TransferConflictActions
                  transferId={transfer.transferId}
                  onResolve={resolveConflict}
                />
              )}
```

and change that following condition to suppress the normal controls during a conflict:

```tsx
              {!hasConflict && (transfer.status === "active" || transfer.status === "queued" || transfer.status === "paused") && (
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/ui test -- TransferPanel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/features/sftp/components/TransferPanel.tsx apps/ui/src/features/sftp/components/TransferPanel.test.tsx
git commit -m "fix(sftp): resolve conflicts from the default transfer panel"
```

---

### Task 5: Classify invalid UTF-8 as binary in main

**Files:**
- Modify: `apps/desktop/src/main/ipc/sftpIpc.ts:231-239`
- Test: `apps/desktop/src/main/ipc/sftpIpc.encoding.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeFileContent(buffer: Buffer): { content: string; encoding: "utf-8" | "base64" }` — exported for testing, now rejecting invalid UTF-8 as well as NUL bytes.

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/main/ipc/sftpIpc.encoding.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeFileContent } from "./sftpIpc";

describe("normalizeFileContent", () => {
  it("returns plain UTF-8 text as utf-8", () => {
    const result = normalizeFileContent(Buffer.from("hello wörld", "utf8"));

    expect(result.encoding).toBe("utf-8");
    expect(result.content).toBe("hello wörld");
  });

  it("classifies NUL-containing content as base64", () => {
    const result = normalizeFileContent(Buffer.from([0x68, 0x00, 0x69]));

    expect(result.encoding).toBe("base64");
  });

  it("classifies invalid UTF-8 as base64 rather than corrupting it", () => {
    // 0xA9 is a lone continuation byte — valid latin-1, invalid UTF-8, no NULs.
    const latin1 = Buffer.from([0x63, 0x6f, 0x70, 0x79, 0xa9]);

    const result = normalizeFileContent(latin1);

    expect(result.encoding).toBe("base64");
    expect(Buffer.from(result.content, "base64").equals(latin1)).toBe(true);
  });

  it("does not truncate a large valid UTF-8 file to its first 8KB", () => {
    const large = Buffer.from("é".repeat(20000), "utf8");

    const result = normalizeFileContent(large);

    expect(result.encoding).toBe("utf-8");
    expect(result.content).toHaveLength(20000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/desktop test -- sftpIpc.encoding`
Expected: FAIL — `normalizeFileContent` is not exported, and the latin-1 case returns `utf-8`.

- [ ] **Step 3: Implement**

Replace `normalizeFileContent` in `apps/desktop/src/main/ipc/sftpIpc.ts` (lines 231–239):

```ts
/**
 * Decide how a remote file crosses the IPC boundary.
 *
 * NUL bytes catch obvious binaries, but a latin-1 text file has none — decoding
 * it as UTF-8 yields U+FFFD replacement characters, and saving that back
 * silently destroys the original bytes. Anything that is not strictly valid
 * UTF-8 therefore travels as base64 and opens read-only.
 */
export function normalizeFileContent(buffer: Buffer): {
  content: string;
  encoding: "utf-8" | "base64";
} {
  // Check for null bytes in first 8KB to detect binary content
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) {
    return { content: buffer.toString("base64"), encoding: "base64" };
  }

  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { content, encoding: "utf-8" };
  } catch {
    return { content: buffer.toString("base64"), encoding: "base64" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/desktop test -- sftpIpc.encoding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/sftpIpc.ts apps/desktop/src/main/ipc/sftpIpc.encoding.test.ts
git commit -m "fix(sftp): treat invalid UTF-8 as binary instead of corrupting it"
```

---

### Task 6: Editor keeps the encoding and opens binaries read-only

**Files:**
- Modify: `apps/ui/src/features/editor/stores/editorStore.ts`
- Modify: `apps/ui/src/features/editor/EditorApp.tsx:28-123`
- Test: `apps/ui/src/features/editor/stores/editorStore.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeFileContent` behaviour from Task 5.
- Produces: `EditorTab.encoding: "utf-8" | "base64"`, `EditorTab.readOnly: boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/features/editor/stores/editorStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createEditorStore } from "./editorStore";

describe("editorStore", () => {
  it("carries encoding and read-only state on a tab", () => {
    const store = createEditorStore("s1");

    store.getState().addTab({
      id: "t1",
      remotePath: "/r/bin",
      fileName: "bin",
      content: "",
      originalContent: "",
      dirty: false,
      loading: true,
      error: null,
      language: "plaintext",
      encoding: "base64",
      readOnly: true
    });

    const tab = store.getState().tabs[0];
    expect(tab.encoding).toBe("base64");
    expect(tab.readOnly).toBe(true);
  });

  it("defaults a text tab to editable utf-8", () => {
    const store = createEditorStore("s1");

    store.getState().addTab({
      id: "t1",
      remotePath: "/r/txt",
      fileName: "txt",
      content: "hi",
      originalContent: "hi",
      dirty: false,
      loading: false,
      error: null,
      language: "plaintext",
      encoding: "utf-8",
      readOnly: false
    });

    expect(store.getState().tabs[0].readOnly).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- editorStore`
Expected: FAIL — TypeScript rejects `encoding` and `readOnly`; they are not on `EditorTab`.

- [ ] **Step 3: Add the fields to the store**

In `apps/ui/src/features/editor/stores/editorStore.ts`, add to `EditorTab` after `language: string;`:

```ts
  encoding: "utf-8" | "base64";
  readOnly: boolean;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- editorStore`
Expected: PASS.

- [ ] **Step 5: Use the encoding in `EditorApp`**

In `apps/ui/src/features/editor/EditorApp.tsx`:

1. In `openFile`, extend the `addTab` call with the two new fields:

```tsx
      s.addTab({
        id: tabId,
        remotePath,
        fileName,
        content: "",
        originalContent: "",
        dirty: false,
        loading: true,
        error: null,
        language,
        encoding: "utf-8",
        readOnly: false,
      });
```

2. Replace the response-handling block (lines 68–77) so binary content is preserved rather than decoded:

```tsx
        if (response.encoding === "base64") {
          storeRef.current.getState().updateTab(tabId, {
            loading: false,
            content: "",
            originalContent: "",
            encoding: "base64",
            readOnly: true,
          });
          return;
        }

        storeRef.current.getState().updateTab(tabId, {
          loading: false,
          content: response.content,
          originalContent: response.content,
          encoding: "utf-8",
          readOnly: false,
        });
```

3. Remove the now-unused `decodeBase64Utf8` import on line 10.

4. Guard `handleSave` — add to the early return on line 102:

```tsx
    if (!tab || disconnected || tab.readOnly) return;
```

5. Render the binary banner. Replace the `activeTab.loading ? (...)` ternary's *false* branch opening so a read-only tab shows the notice instead of the editor. Insert immediately before the `<Suspense>` element:

```tsx
          ) : activeTab.readOnly ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-text-primary">
                {activeTab.fileName} is a binary file
              </p>
              <p className="max-w-md text-xs text-text-secondary">
                Editing it here would corrupt its contents, so it is open read-only.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100"
                  onClick={() => void handleDownloadBinary(activeTab.remotePath, activeTab.fileName)}
                >
                  Download
                </button>
              </div>
            </div>
```

6. Add the download handler beside `handleSave`:

```tsx
  const handleDownloadBinary = useCallback(
    async (remotePath: string, fileName: string) => {
      const targetPath = await window.hypershell?.fsShowSaveDialog?.({ defaultPath: fileName });
      if (!targetPath) return;

      await window.hypershell?.sftpTransferStart?.({
        sftpSessionId,
        operations: [
          { type: "download", localPath: targetPath, remotePath, isDirectory: false },
        ],
      });
    },
    [sftpSessionId]
  );
```

7. Disable the toolbar save for read-only tabs — pass `disabled={sessionDisconnected || Boolean(activeTab?.readOnly)}` to `<EditorToolbar>`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @hypershell/ui test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/features/editor/stores/editorStore.ts apps/ui/src/features/editor/stores/editorStore.test.ts apps/ui/src/features/editor/EditorApp.tsx
git commit -m "fix(editor): open binary files read-only instead of corrupting them"
```

---

### Task 7: Atomic remote writes with a portable rename

**Files:**
- Modify: `packages/session-core/src/transports/sftpTransport.ts:518-526`
- Test: `packages/session-core/src/transports/sftpTransport.atomicWrite.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `renameWithOverwrite(sftpSession: SFTPWrapper, from: string, to: string): Promise<void>` (exported), and `SftpTransportHandle.writeFile` becoming atomic. The handle's public signature is unchanged.

Rename-over-existing is the fiddly part: SFTP v3 `RENAME` fails when the destination exists on OpenSSH, so a naive temp+rename breaks on the most common server in the world.

- [ ] **Step 1: Write the failing test**

Create `packages/session-core/src/transports/sftpTransport.atomicWrite.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { renameWithOverwrite } from "./sftpTransport";

type Cb = (err?: Error | null) => void;

describe("renameWithOverwrite", () => {
  it("prefers the OpenSSH posix-rename extension", async () => {
    const calls: string[] = [];
    const session = {
      ext_openssh_rename: (_f: string, _t: string, cb: Cb) => { calls.push("posix"); cb(null); },
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["posix"]);
  });

  it("falls back to plain rename when the extension is absent", async () => {
    const calls: string[] = [];
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["rename"]);
  });

  it("unlinks then renames when the server refuses to clobber", async () => {
    const calls: string[] = [];
    let renameAttempts = 0;
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => {
        renameAttempts += 1;
        calls.push("rename");
        cb(renameAttempts === 1 ? new Error("Failure") : null);
      },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["rename", "unlink", "rename"]);
  });

  it("falls back to plain rename when the extension itself errors", async () => {
    const calls: string[] = [];
    const session = {
      ext_openssh_rename: (_f: string, _t: string, cb: Cb) => {
        calls.push("posix");
        cb(new Error("unsupported"));
      },
      rename: (_f: string, _t: string, cb: Cb) => { calls.push("rename"); cb(null); },
      unlink: (_p: string, cb: Cb) => { calls.push("unlink"); cb(null); },
    };

    await renameWithOverwrite(session as never, "/a.tmp", "/a");

    expect(calls).toEqual(["posix", "rename"]);
  });

  it("propagates a failure when every strategy fails", async () => {
    const session = {
      rename: (_f: string, _t: string, cb: Cb) => cb(new Error("denied")),
      unlink: (_p: string, cb: Cb) => cb(null),
    };

    await expect(renameWithOverwrite(session as never, "/a.tmp", "/a")).rejects.toThrow("denied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/session-core test -- sftpTransport.atomicWrite`
Expected: FAIL — `renameWithOverwrite` is not exported.

- [ ] **Step 3: Implement the rename helper**

In `packages/session-core/src/transports/sftpTransport.ts`, change the crypto import on line 2 to:

```ts
import { createHash, randomBytes } from "node:crypto";
```

Add at module scope, above `export function buildConnectConfig`:

```ts
interface PosixRenameCapable {
  ext_openssh_rename?: (from: string, to: string, cb: (err?: Error | null) => void) => void;
}

function callbackToPromise(
  invoke: (cb: (err?: Error | null) => void) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    invoke((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * Rename `from` over `to`, clobbering an existing destination.
 *
 * SFTP v3's RENAME is specified to fail when the destination exists, and
 * OpenSSH honours that. The posix-rename@openssh.com extension does what
 * POSIX rename(2) does; where it is unavailable the only portable option is to
 * unlink the destination first, which briefly exposes a missing file — hence
 * the ordering here, cheapest and safest first.
 */
export async function renameWithOverwrite(
  sftpSession: SFTPWrapper,
  from: string,
  to: string
): Promise<void> {
  const posixRename = (sftpSession as SFTPWrapper & PosixRenameCapable).ext_openssh_rename;

  if (typeof posixRename === "function") {
    try {
      await callbackToPromise((cb) => posixRename.call(sftpSession, from, to, cb));
      return;
    } catch {
      // Advertised but refused — fall through to the portable path.
    }
  }

  try {
    await callbackToPromise((cb) => sftpSession.rename(from, to, cb));
    return;
  } catch (renameError) {
    try {
      await callbackToPromise((cb) => sftpSession.unlink(to, cb));
    } catch {
      throw renameError;
    }
  }

  await callbackToPromise((cb) => sftpSession.rename(from, to, cb));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/session-core test -- sftpTransport.atomicWrite`
Expected: PASS.

- [ ] **Step 5: Make `writeFile` atomic**

Replace `writeFile` (lines 518–526) with:

```ts
  /**
   * Write via a sibling temp file and rename into place. A dropped connection
   * then leaves a stray temp file rather than a truncated original — the
   * previous implementation streamed straight onto the live path.
   */
  async function writeFile(remotePath: string, data: Buffer): Promise<void> {
    const slashIndex = remotePath.lastIndexOf("/");
    const directory = slashIndex > 0 ? remotePath.slice(0, slashIndex) : "";
    const baseName = remotePath.slice(slashIndex + 1);
    const tempPath = `${directory}/.${baseName}.hypershell-${randomBytes(6).toString("hex")}.tmp`;

    // A fresh temp file is created with default permissions, so an existing
    // file's mode has to be carried across explicitly or the rename silently
    // resets it.
    let originalMode: number | null = null;
    try {
      originalMode = (await stat(remotePath)).permissions;
    } catch {
      originalMode = null;
    }

    const sftpSession = requireSftp();

    try {
      await new Promise<void>((resolve, reject) => {
        const stream = sftpSession.createWriteStream(tempPath);
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(data);
      });

      if (originalMode != null) {
        await chmod(tempPath, originalMode);
      }

      await renameWithOverwrite(sftpSession, tempPath, remotePath);
    } catch (error) {
      await new Promise<void>((resolve) => {
        sftpSession.unlink(tempPath, () => resolve());
      });
      throw error;
    }
  }
```

- [ ] **Step 6: Verify the workspace still builds and passes**

Run: `pnpm --filter @hypershell/session-core test && pnpm --filter @hypershell/session-core build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/session-core/src/transports/sftpTransport.ts packages/session-core/src/transports/sftpTransport.atomicWrite.test.ts
git commit -m "fix(sftp): write remote files atomically via temp-and-rename"
```

---

### Task 8: Detect remote changes before overwriting on save

**Files:**
- Modify: `packages/shared/src/ipc/sftpSchemas.ts:90-102`
- Modify: `apps/desktop/src/main/ipc/sftpIpc.ts`
- Modify: `apps/desktop/src/preload/desktopApi.ts` (or the SFTP preload module that defines `sftpWriteFile`)
- Modify: `apps/ui/src/types/global.d.ts`
- Create: `apps/ui/src/features/editor/components/SaveConflictDialog.tsx`
- Modify: `apps/ui/src/features/editor/EditorApp.tsx`
- Test: `packages/shared/src/ipc/sftpSchemas.test.ts`

**Interfaces:**
- Consumes: `EditorTab.encoding` / `readOnly` (Task 6), atomic `writeFile` (Task 7).
- Produces:
  - `sftpReadFileResponseSchema` gains `size: number`, `modifiedAt: string`.
  - `sftpWriteFileRequestSchema` gains `expectedSize?: number`, `expectedModifiedAt?: string`.
  - New `sftpWriteFileResponseSchema = { status: "written" | "conflict"; size: number; modifiedAt: string }`.
  - `EditorTab` gains `baseSize: number | null`, `baseModifiedAt: string | null`.

- [ ] **Step 1: Write the failing schema test**

Append to `packages/shared/src/ipc/sftpSchemas.test.ts`:

```ts
describe("write-file versioning", () => {
  it("carries version metadata on a read response", () => {
    const parsed = sftpReadFileResponseSchema.parse({
      content: "hi",
      encoding: "utf-8",
      size: 2,
      modifiedAt: "2026-08-13T00:00:00.000Z"
    });

    expect(parsed.size).toBe(2);
    expect(parsed.modifiedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("accepts a write request without expectations (force overwrite)", () => {
    const parsed = sftpWriteFileRequestSchema.parse({
      sftpSessionId: "s1",
      path: "/r/f",
      content: "hi"
    });

    expect(parsed.expectedSize).toBeUndefined();
    expect(parsed.expectedModifiedAt).toBeUndefined();
  });

  it("reports a conflict outcome", () => {
    const parsed = sftpWriteFileResponseSchema.parse({
      status: "conflict",
      size: 9,
      modifiedAt: "2026-08-13T01:00:00.000Z"
    });

    expect(parsed.status).toBe("conflict");
  });
});
```

Add `sftpWriteFileResponseSchema` to the file's existing import list from `./sftpSchemas`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/shared test -- sftpSchemas`
Expected: FAIL — `sftpWriteFileResponseSchema` does not exist; `size` is stripped from the read response.

- [ ] **Step 3: Extend the schemas**

In `packages/shared/src/ipc/sftpSchemas.ts`, replace lines 90–102:

```ts
export const sftpReadFileResponseSchema = z.object({
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]),
  size: z.number(),
  modifiedAt: z.string()
});
export type SftpReadFileResponse = z.infer<typeof sftpReadFileResponseSchema>;

export const sftpWriteFileRequestSchema = z.object({
  sftpSessionId: z.string(),
  path: z.string(),
  content: z.string(),
  encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8"),
  // Omit both to force an unconditional overwrite. Supplying them makes the
  // write conditional on the remote file being unchanged since it was read.
  expectedSize: z.number().optional(),
  expectedModifiedAt: z.string().optional()
});
export type SftpWriteFileRequest = z.infer<typeof sftpWriteFileRequestSchema>;

export const sftpWriteFileResponseSchema = z.object({
  status: z.enum(["written", "conflict"]),
  size: z.number(),
  modifiedAt: z.string()
});
export type SftpWriteFileResponse = z.infer<typeof sftpWriteFileResponseSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/shared test -- sftpSchemas`
Expected: PASS.

- [ ] **Step 5: Enforce the check in main**

In `apps/desktop/src/main/ipc/sftpIpc.ts`, find the `sftp.readFile` handler and include the stat in its response:

```ts
    const entry = await transport.stat(request.path);
    const buffer = await transport.readFile(request.path);
    const normalized = normalizeFileContent(buffer);

    return {
      ...normalized,
      size: entry.size,
      modifiedAt: entry.modifiedAt
    };
```

In the `sftp.writeFile` handler, guard before writing and return the new stat:

```ts
    if (request.expectedSize != null && request.expectedModifiedAt != null) {
      const current = await transport.stat(request.path);
      if (current.size !== request.expectedSize || current.modifiedAt !== request.expectedModifiedAt) {
        return {
          status: "conflict" as const,
          size: current.size,
          modifiedAt: current.modifiedAt
        };
      }
    }

    await transport.writeFile(request.path, Buffer.from(request.content, request.encoding));
    const written = await transport.stat(request.path);

    return {
      status: "written" as const,
      size: written.size,
      modifiedAt: written.modifiedAt
    };
```

- [ ] **Step 6: Thread the response through preload and types**

In the preload module defining `sftpWriteFile`, parse the new response:

```ts
    async sftpWriteFile(request: SftpWriteFileRequest): Promise<SftpWriteFileResponse> {
      const parsed = sftpWriteFileRequestSchema.parse(request);
      const result = await ipcRenderer.invoke(ipcChannels.sftp.writeFile, parsed);
      return sftpWriteFileResponseSchema.parse(result);
    },
```

Mirror both signature changes in `apps/ui/src/types/global.d.ts`.

- [ ] **Step 7: Add the conflict dialog**

Create `apps/ui/src/features/editor/components/SaveConflictDialog.tsx`:

```tsx
import { useState } from "react";

export interface SaveConflictDialogProps {
  fileName: string;
  remotePath: string;
  onOverwrite: () => void;
  onReload: () => void;
  onSaveAs: (newRemotePath: string) => void;
  onCancel: () => void;
}

/**
 * Shown when the remote file changed between opening it and saving. Every
 * option here preserves one side of the divergence — none of them can lose
 * both.
 */
export function SaveConflictDialog({
  fileName,
  remotePath,
  onOverwrite,
  onReload,
  onSaveAs,
  onCancel
}: SaveConflictDialogProps) {
  const [saveAsPath, setSaveAsPath] = useState(`${remotePath}.new`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remote file changed"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-[min(520px,90vw)] rounded-lg border border-base-600 bg-base-900 p-4 text-text-primary">
        <h2 className="text-sm font-semibold">{fileName} changed on the server</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Someone or something modified this file after you opened it. Saving now would
          discard those changes.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs text-red-200"
            onClick={onOverwrite}
          >
            Overwrite
          </button>
          <button
            type="button"
            className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100"
            onClick={onReload}
          >
            Reload from server
          </button>
          <button
            type="button"
            className="rounded border border-base-600 px-3 py-1 text-xs text-text-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 border-t border-base-700 pt-3">
          <label className="text-xs text-text-secondary" htmlFor="save-as-path">
            Or save a copy as:
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="save-as-path"
              type="text"
              value={saveAsPath}
              onChange={(event) => setSaveAsPath(event.target.value)}
              className="flex-1 rounded bg-base-800 px-2 py-1 text-xs outline-none focus:border focus:border-accent/50"
            />
            <button
              type="button"
              className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100"
              onClick={() => onSaveAs(saveAsPath)}
            >
              Save As
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Wire it into `EditorApp`**

Add `baseSize: number | null` and `baseModifiedAt: string | null` to `EditorTab` in `editorStore.ts`. Populate them in `openFile` from the read response (`response.size`, `response.modifiedAt`) and in the initial `addTab` as `null`.

Add state and a save routine that takes an explicit force flag:

```tsx
  const [conflict, setConflict] = useState<{ tabId: string } | null>(null);

  const writeTab = useCallback(
    async (tabId: string, targetPath: string, force: boolean) => {
      const tab = storeRef.current.getState().tabs.find((t) => t.id === tabId);
      if (!tab) return;

      setSaving(true);
      try {
        const response = await window.hypershell?.sftpWriteFile?.({
          sftpSessionId,
          path: targetPath,
          content: tab.content,
          encoding: "utf-8",
          ...(force || tab.baseSize == null || tab.baseModifiedAt == null
            ? {}
            : { expectedSize: tab.baseSize, expectedModifiedAt: tab.baseModifiedAt }),
        });

        if (response?.status === "conflict") {
          setConflict({ tabId });
          return;
        }

        storeRef.current.getState().updateTab(tabId, {
          remotePath: targetPath,
          originalContent: tab.content,
          dirty: false,
          error: null,
          baseSize: response?.size ?? null,
          baseModifiedAt: response?.modifiedAt ?? null,
        });
        setConflict(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save file";
        storeRef.current.getState().updateTab(tabId, { error: message });
      } finally {
        setSaving(false);
      }
    },
    [sftpSessionId]
  );
```

Rewrite `handleSave` to delegate:

```tsx
  const handleSave = useCallback(async () => {
    const { tabs: currentTabs, activeTabId: currentId, sessionDisconnected: disconnected } =
      storeRef.current.getState();
    const tab = currentTabs.find((t) => t.id === currentId);
    if (!tab || disconnected || tab.readOnly) return;

    await writeTab(tab.id, tab.remotePath, false);
  }, [writeTab]);
```

Render the dialog inside the root `<div>`, after the editor region:

```tsx
      {conflict ? (
        <SaveConflictDialog
          fileName={tabs.find((t) => t.id === conflict.tabId)?.fileName ?? ""}
          remotePath={tabs.find((t) => t.id === conflict.tabId)?.remotePath ?? ""}
          onOverwrite={() => {
            const tab = storeRef.current.getState().tabs.find((t) => t.id === conflict.tabId);
            if (tab) void writeTab(tab.id, tab.remotePath, true);
          }}
          onReload={() => {
            const tab = storeRef.current.getState().tabs.find((t) => t.id === conflict.tabId);
            setConflict(null);
            if (tab) {
              storeRef.current.getState().removeTab(tab.id);
              void openFile(tab.remotePath);
            }
          }}
          onSaveAs={(newPath) => {
            void writeTab(conflict.tabId, newPath, true);
          }}
          onCancel={() => setConflict(null)}
        />
      ) : null}
```

- [ ] **Step 9: Verify**

Run: `pnpm --filter @hypershell/shared test && pnpm --filter @hypershell/desktop test && pnpm --filter @hypershell/ui test`
Then: `pnpm --filter @hypershell/desktop build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/ipc/sftpSchemas.ts packages/shared/src/ipc/sftpSchemas.test.ts apps/desktop/src/main/ipc/sftpIpc.ts apps/desktop/src/preload apps/ui/src/types/global.d.ts apps/ui/src/features/editor
git commit -m "feat(editor): detect remote changes before overwriting on save"
```

---

### Task 9: Stream sync downloads and isolate per-file failures

**Files:**
- Modify: `packages/session-core/src/sftp/syncEngine.ts:221-260`
- Modify: `packages/shared/src/ipc/sftpSchemas.ts` (sync-complete event)
- Test: `packages/session-core/src/sftp/syncEngine.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `sync-complete` event gains `filesFailed: number`.

Two defects here: `transport.readFile()` rejects above 10 MB (sftpTransport.ts:498), and because the call sits inside the outer `try`, one oversized file aborts the whole run.

- [ ] **Step 1: Write the failing tests**

Append to `packages/session-core/src/sftp/syncEngine.test.ts`:

```ts
import { Readable } from "node:stream";

describe("remote-to-local sync", () => {
  function remoteFile(name: string, size: number) {
    return {
      name,
      path: `/remote/${name}`,
      relativePath: name,
      size,
      modifiedAt: new Date().toISOString(),
      isDirectory: false,
      permissions: 0o644,
      owner: 0,
      group: 0,
    };
  }

  it("streams files larger than the editor read limit", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();
    const big = remoteFile("big.bin", 25 * 1024 * 1024);

    transport.list.mockResolvedValue([big]);
    transport.createReadStream.mockImplementation(() => Readable.from([Buffer.alloc(1024)]));

    const syncId = engine.start(transport as never, {
      localPath: "/tmp/sync-test",
      remotePath: "/remote",
      direction: "remote-to-local",
      excludePatterns: [],
      deleteOrphans: false,
    });

    await engine.run(syncId);

    expect(transport.readFile).not.toHaveBeenCalled();
    expect(transport.createReadStream).toHaveBeenCalledWith(big.path);
  });

  it("keeps syncing after one file fails", async () => {
    const engine = createSyncEngine();
    const transport = createMockTransport();

    transport.list.mockResolvedValue([remoteFile("bad.bin", 10), remoteFile("good.bin", 10)]);
    transport.createReadStream.mockImplementationOnce(() => {
      const stream = new Readable({ read() {} });
      queueMicrotask(() => stream.destroy(new Error("permission denied")));
      return stream;
    }).mockImplementation(() => Readable.from([Buffer.alloc(10)]));

    const syncId = engine.start(transport as never, {
      localPath: "/tmp/sync-test",
      remotePath: "/remote",
      direction: "remote-to-local",
      excludePatterns: [],
      deleteOrphans: false,
    });

    await engine.run(syncId);

    const status = engine.list().find((s) => s.syncId === syncId);
    expect(status?.status).not.toBe("error");
    expect(transport.createReadStream).toHaveBeenCalledTimes(2);
  });
});
```

> Adapt `engine.run(syncId)` and the remote-scan mock to whatever `syncEngine.ts` actually exposes — read `scanRemoteDir` and the run entry point first. The assertions (no `readFile`, both files attempted) are the contract; the plumbing is not.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @hypershell/session-core test -- syncEngine`
Expected: FAIL — `readFile` is called, and the second test aborts after the first failure.

- [ ] **Step 3: Implement streaming with per-file isolation**

In `packages/session-core/src/sftp/syncEngine.ts`, add to the existing `node:fs/promises` import: `rename`, and import `createWriteStream` from `node:fs`.

Replace the `if (needsDownload) { ... }` body (lines 243–258):

```ts
            if (needsDownload) {
              emit({
                kind: "sync-progress",
                syncId,
                filesScanned: managed.status.filesScanned,
                filesSynced: managed.status.filesSynced,
                currentFile: file.relativePath,
              });

              // Stream rather than buffer: transport.readFile() is the editor's
              // API and rejects anything over 10 MB, which silently made sync
              // unusable for real payloads.
              const tempPath = `${localFilePath}.hypershell-sync.tmp`;
              try {
                await mkdir(dirname(localFilePath), { recursive: true });

                const remoteStream = transport.createReadStream(file.path);
                const localStream = createWriteStream(tempPath);
                await new Promise<void>((resolve, reject) => {
                  remoteStream.on("error", reject);
                  localStream.on("error", reject);
                  localStream.on("close", () => resolve());
                  remoteStream.pipe(localStream);
                });

                await rename(tempPath, localFilePath);

                managed.status.filesSynced++;
                managed.status.bytesTransferred += file.size;
              } catch (fileError) {
                // One unreadable file must not abandon the rest of the run.
                failures.push({
                  path: file.relativePath,
                  error: fileError instanceof Error ? fileError.message : String(fileError),
                });
                await rm(tempPath, { force: true }).catch(() => {});
              }
            }
```

Declare `const failures: Array<{ path: string; error: string }> = [];` at the top of the run body, add `rm` to the `node:fs/promises` import, and replace the completion block:

```ts
        managed.status.status = "idle";
        managed.status.lastSyncAt = new Date().toISOString();
        managed.status.lastError =
          failures.length > 0
            ? `${failures.length} file(s) failed; first: ${failures[0].path} — ${failures[0].error}`
            : null;

        emit({
          kind: "sync-complete",
          syncId,
          filesSynced: managed.status.filesSynced,
          bytesTransferred: managed.status.bytesTransferred,
          filesFailed: failures.length,
        });
```

In `packages/shared/src/ipc/sftpSchemas.ts`, add to the `sync-complete` member of `sftpSyncEventSchema`:

```ts
    filesFailed: z.number().default(0),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @hypershell/session-core test -- syncEngine && pnpm --filter @hypershell/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/session-core/src/sftp/syncEngine.ts packages/session-core/src/sftp/syncEngine.test.ts packages/shared/src/ipc/sftpSchemas.ts
git commit -m "fix(sftp): stream sync downloads and isolate per-file failures"
```

---

### Task 10: Discard stale directory listings in both panes

**Files:**
- Modify: `apps/ui/src/features/sftp/components/RemotePane.tsx:123-149`
- Modify: `apps/ui/src/features/sftp/components/LocalPane.tsx:92-125`
- Test: `apps/ui/src/features/sftp/components/paneRequestGuard.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `createRequestGuard(): { begin: () => number; isCurrent: (token: number) => boolean }` in `apps/ui/src/features/sftp/utils/requestGuard.ts`.

Extracting the guard keeps both panes honest about using identical semantics, and makes the ordering logic testable without rendering.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/features/sftp/components/paneRequestGuard.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createRequestGuard } from "../utils/requestGuard";

describe("createRequestGuard", () => {
  it("treats the newest request as current", () => {
    const guard = createRequestGuard();

    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("keeps a single request current until superseded", () => {
    const guard = createRequestGuard();
    const token = guard.begin();

    expect(guard.isCurrent(token)).toBe(true);
    expect(guard.isCurrent(token)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @hypershell/ui test -- paneRequestGuard`
Expected: FAIL — cannot resolve `../utils/requestGuard`.

- [ ] **Step 3: Implement the guard**

Create `apps/ui/src/features/sftp/utils/requestGuard.ts`:

```ts
export interface RequestGuard {
  /** Claims the next token and supersedes every earlier one. */
  begin: () => number;
  /** True only for the most recently issued token. */
  isCurrent: (token: number) => boolean;
}

/**
 * Monotonic request tokens for a single pane.
 *
 * Directory listings resolve out of order — navigate quickly and the slower
 * response for the previous path lands last, painting files that belong to a
 * directory the user already left. Results, errors, and loading transitions
 * must all be gated on the token still being current.
 */
export function createRequestGuard(): RequestGuard {
  let latest = 0;

  return {
    begin: () => {
      latest += 1;
      return latest;
    },
    isCurrent: (token: number) => token === latest
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @hypershell/ui test -- paneRequestGuard`
Expected: PASS.

- [ ] **Step 5: Apply it in `RemotePane`**

Add the import and a ref inside the component:

```tsx
import { createRequestGuard } from "../utils/requestGuard";
```

```tsx
  const requestGuard = useRef(createRequestGuard());
```

(Add `useRef` to the existing `react` import if absent.)

Replace `loadDirectory` (lines 123–149):

```tsx
  const loadDirectory = useCallback(
    async (path: string) => {
      if (!sftpSessionId) {
        return;
      }

      const token = requestGuard.current.begin();
      setLoading("remote", true);
      setError("remote", null);

      try {
        const sftpList = window.hypershell?.sftpList;
        if (!sftpList) {
          throw new Error("SFTP list API is unavailable in preload bridge");
        }
        const response = await sftpList({ sftpSessionId, path });
        if (!requestGuard.current.isCurrent(token)) {
          return;
        }
        const entries = extractRemoteEntries(response);
        setRemoteEntries(entries);
      } catch (loadError) {
        if (!requestGuard.current.isCurrent(token)) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list remote directory";
        console.error("[sftp-ui] loadDirectory failed:", message);
        setError("remote", message);
      } finally {
        if (requestGuard.current.isCurrent(token)) {
          setLoading("remote", false);
        }
      }
    },
    [setError, setLoading, setRemoteEntries, sftpSessionId]
  );
```

- [ ] **Step 6: Apply it in `LocalPane`**

Same import and ref. Replace `loadDirectory` (lines 92–125):

```tsx
  const loadDirectory = useCallback(
    async (path: string) => {
      if (!path) {
        return;
      }

      const token = requestGuard.current.begin();
      setLoading("local", true);
      setError("local", null);

      try {
        const response = await window.hypershell?.fsList?.({ path });
        if (!requestGuard.current.isCurrent(token)) {
          return;
        }
        setLocalEntries(response?.entries ?? []);
      } catch (loadError) {
        if (!requestGuard.current.isCurrent(token)) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : "Failed to list local directory";
        if (message.includes("outside the allowed filesystem roots")) {
          try {
            const home = await window.hypershell?.fsGetHome?.();
            if (home?.path && home.path !== path && requestGuard.current.isCurrent(token)) {
              setLocalPath(home.path);
              setError("local", `Path is outside allowed roots. Returned to ${home.path}.`);
              return;
            }
          } catch {
            // Fall through to the original error if home lookup fails.
          }
        }
        setError("local", message);
      } finally {
        if (requestGuard.current.isCurrent(token)) {
          setLoading("local", false);
        }
      }
    },
    [setError, setLoading, setLocalEntries, setLocalPath]
  );
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @hypershell/ui test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/features/sftp/utils/requestGuard.ts apps/ui/src/features/sftp/components/paneRequestGuard.test.ts apps/ui/src/features/sftp/components/RemotePane.tsx apps/ui/src/features/sftp/components/LocalPane.tsx
git commit -m "fix(sftp): discard directory listings for superseded navigations"
```

---

### Task 11: Full verification

**Files:** none modified.

- [ ] **Step 1: Build every workspace**

Run: `pnpm build`
Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run every unit suite**

Run:
```bash
pnpm --filter @hypershell/shared test
pnpm --filter @hypershell/session-core test
pnpm --filter @hypershell/desktop test
pnpm --filter @hypershell/ui test
```
Expected: PASS.

- [ ] **Step 3: Run browser E2E**

Run: `pnpm --filter @hypershell/ui test:e2e`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Manual smoke against a real host**

Rebuild and restart Electron (`pnpm --filter @hypershell/desktop build`), then confirm by hand:

1. Upload a file that already exists remotely with the **popup monitor disabled** (the default). The inline panel must offer Overwrite / Skip / Rename. Close the panel mid-conflict — the "N need attention" button must remain.
2. Open a binary remote file (e.g. `/bin/ls`) in the editor. It must open read-only with the banner and a working Download.
3. Open a text file, modify it on the server via the terminal, then save. The conflict dialog must appear; Reload must show the server's version.
4. Sync a directory containing a file over 10 MB, remote-to-local. It must complete.
5. Navigate rapidly through several remote directories. The listing must always match the breadcrumb.

- [ ] **Step 6: Commit any fixes, then tag the phase**

```bash
git commit --allow-empty -m "chore(sftp): phase 1 data integrity complete"
```

---

## Self-Review

**Spec coverage** — every Phase 1 requirement maps to a task:

| Spec section | Task(s) |
|---|---|
| 1.1 conflict state in store | 1, 2 |
| 1.1 shared conflict component | 3, 4 |
| 1.1 `userInitiated` gate | 4 |
| 1.1 `attentionCount` affordance | 1, 4 |
| 1.2 persist encoding | 6 |
| 1.2 invalid UTF-8 detection | 5 |
| 1.2 binary read-only + Download | 6 |
| 1.3 `writeFileAtomic` + chmod | 7 |
| 1.3 rename fallback chain | 7 |
| 1.3 version check + dialog | 8 |
| 1.4 streaming download | 9 |
| 1.4 per-file error isolation | 9 |
| 1.5 request-id guard, both panes | 10 |

**Known deviations from the spec, deliberate:**
- The spec named the new transport method `writeFileAtomic`. Task 7 instead makes the existing `writeFile` atomic, because every caller wants atomicity and a second method would leave the unsafe one available by mistake. The handle's public interface is unchanged.
- "Open externally" is not implemented for binaries — only Download. Opening externally requires staging to a temp file, which duplicates the drag-out staging path in `sftpIpc.ts:255`; Download plus the OS file manager covers the need without that duplication. Flag at review if you disagree.

**Type consistency:** `conflictIds` / `setConflict` / `clearConflict` / `attentionCount` (Task 1) are used with identical names in Tasks 2–4. `TransferConflictResolution` is exported from Task 3 and matches the popup's existing inline union. `encoding` / `readOnly` / `baseSize` / `baseModifiedAt` (Tasks 6, 8) are consistent. `renameWithOverwrite` (Task 7) is used only within its own module.

**Two tasks carry adaptation notes rather than exact code** — Task 9's sync-engine test plumbing and Task 8's preload file path, because both depend on module details the implementer must read first. Both state the contract precisely; only the wiring is discovered.
