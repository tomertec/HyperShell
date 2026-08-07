# Runtime CLI Tab Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show npm CLI bin names such as `claude` and `pi` instead of the shared `node` runtime in local terminal tab titles.

**Architecture:** The Windows process-tree provider will request command lines and enrich nodes with an optional resolved display name. A new cached resolver will map a Node entry script to the exact matching `package.json` bin key; foreground selection will prefer that name and otherwise preserve the current executable fallback.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, `@vscode/windows-process-tree`, Vitest, pnpm.

## Global Constraints

- Resolve Node CLIs generically from package metadata; do not hardcode Claude or Pi mappings.
- Do not expose process command lines outside `session-core`.
- Preserve existing shell, passthrough-client, native-executable, and fallback behavior.
- Cache both positive and negative entry-script resolutions.
- Use test-driven development: every production behavior begins with a failing test.
- Preserve unrelated work in the original checkout and stage only files listed by each task.

---

### Task 1: Cached Node CLI bin-name resolver

**Files:**
- Create: `packages/session-core/src/processTitle/nodeCliName.ts`
- Create: `packages/session-core/src/processTitle/nodeCliName.test.ts`

**Interfaces:**
- Consumes: Windows process executable name and optional command line.
- Produces: `NodeCliNameResolver`, `NodeCliNameDeps`, and `createNodeCliNameResolver(deps?)`.

- [ ] **Step 1: Write the failing resolver tests**

Create table-driven and focused tests with an in-memory filesystem. The fixture must exercise these exact cases:

```ts
const files = new Map<string, string>([
  [
    "C:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\package.json",
    JSON.stringify({
      name: "@earendil-works/pi-coding-agent",
      bin: { pi: "dist/cli.js" }
    })
  ],
  [
    "C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\package.json",
    JSON.stringify({
      name: "@anthropic-ai/claude-code",
      bin: { claude: "cli.js" }
    })
  ]
]);

expect(resolve("node.exe", '"C:\\nvm4w\\nodejs\\node.exe" "C:\\nvm4w\\nodejs\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\cli.js"')).toBe("pi");
expect(resolve("node", 'node "C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"')).toBe("claude");
expect(resolve("git.exe", "git status")).toBeNull();
expect(resolve("node.exe", "node --inspect")).toBeNull();
```

Also assert string-form `bin` uses the unscoped package name, a mismatched bin target returns `null`, invalid JSON returns `null`, and two calls for the same script do not read manifests twice.

- [ ] **Step 2: Run the resolver test and verify RED**

Run:

```powershell
pnpm vitest run packages/session-core/src/processTitle/nodeCliName.test.ts
```

Expected: FAIL because `./nodeCliName` does not exist.

- [ ] **Step 3: Implement the minimal cached resolver**

Implement these public contracts:

```ts
export interface NodeCliNameDeps {
  readFile(path: string): string;
}

export type NodeCliNameResolver = (
  processName: string,
  commandLine?: string
) => string | null;

export function createNodeCliNameResolver(
  deps?: NodeCliNameDeps
): NodeCliNameResolver;
```

Implementation requirements:

- Strip `.exe` case-insensitively and return `null` unless the process is `node`.
- Tokenize quoted/unquoted command-line arguments and select the first absolute `.js`, `.cjs`, or `.mjs` argument after the Node executable.
- Walk from the script directory to the Windows volume root, attempting `package.json` at each level.
- Parse manifests as `unknown`; accept only a string `name` and either string `bin` or a string-valued bin record.
- Normalize targets with `path.win32.resolve()` and compare paths case-insensitively.
- For object-form `bin`, return the exact matching key. For string-form `bin`, return the package name without its npm scope.
- Cache the final `string | null` by lower-cased normalized script path.
- Default `readFile` to `readFileSync(path, "utf8")`.
- Catch all read/parse errors and continue upward; return `null` at the root.

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run:

```powershell
pnpm vitest run packages/session-core/src/processTitle/nodeCliName.test.ts
```

Expected: PASS with all resolver cases green.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- packages/session-core/src/processTitle/nodeCliName.ts packages/session-core/src/processTitle/nodeCliName.test.ts
git diff --cached --check
git commit -m "feat(session-core): resolve Node CLI bin names"
```

---

### Task 2: Enrich Windows process nodes and select resolved names

**Files:**
- Modify: `packages/session-core/src/processTitle/foregroundProcess.ts`
- Modify: `packages/session-core/src/processTitle/foregroundProcess.test.ts`
- Modify: `packages/session-core/src/processTitle/windowsProcessTree.ts`
- Modify: `packages/session-core/src/processTitle/windowsProcessTree.test.ts`
- Modify: `packages/session-core/src/index.ts`

**Interfaces:**
- Consumes: `NodeCliNameResolver` and `createNodeCliNameResolver()` from Task 1.
- Produces: optional `ProcessNode.displayName`; command-line flag `2` passed only inside the Windows provider.

- [ ] **Step 1: Write failing foreground-selection tests**

Extend the test node helper to accept `displayName?: string`, then add:

```ts
it("prefers the resolved runtime CLI name", () => {
  const tree = node("pwsh.exe", [node("node.exe", [], 2, "pi")]);
  expect(pickForegroundName(tree)).toBe("pi");
});

it("falls back to the runtime executable when no CLI name resolves", () => {
  const tree = node("pwsh.exe", [node("node.exe", [], 2)]);
  expect(pickForegroundName(tree)).toBe("node");
});
```

- [ ] **Step 2: Write failing Windows-provider tests**

Change the fake native module to capture the third `flags` argument. Return a `node.exe` child with a command line, inject `resolveNodeCliName: () => "pi"`, and assert:

```ts
expect(flags).toBe(2);
expect(tree).toEqual({
  pid: 4242,
  name: "pwsh.exe",
  children: [{ pid: 4300, name: "node.exe", displayName: "pi", children: [] }]
});
expect(JSON.stringify(tree)).not.toContain("commandLine");
```

Add a fallback assertion where the injected resolver returns `null` and no `displayName` property is present.

- [ ] **Step 3: Run the process-title tests and verify RED**

Run:

```powershell
pnpm vitest run packages/session-core/src/processTitle/foregroundProcess.test.ts packages/session-core/src/processTitle/windowsProcessTree.test.ts
```

Expected: FAIL because `ProcessNode` lacks `displayName`, the provider does not request command lines, and the provider dependency is absent.

- [ ] **Step 4: Implement process-tree enrichment**

Make these exact structural changes:

```ts
export interface ProcessNode {
  pid: number;
  name: string;
  displayName?: string;
  children: ProcessNode[];
}
```

In `windowsProcessTree.ts`:

- Add `commandLine?: string` only to `RawProcessTreeNode`.
- Change `WindowsProcessTreeModule.getProcessTree` to accept `flags?: number`.
- Add `resolveNodeCliName?: NodeCliNameResolver` to `WindowsProcessTreeDeps`.
- Create one default resolver per provider with `createNodeCliNameResolver()`.
- Call `getProcessTree(rootPid, callback, 2)`.
- During recursive mapping, call the resolver and add `displayName` only for a non-null result.
- Never copy `commandLine` into `ProcessNode`.

In `foregroundProcess.ts`, keep filtering based on the executable name, then return `node.displayName ?? strippedExecutableName`.

Export the resolver module from `packages/session-core/src/index.ts`.

- [ ] **Step 5: Run focused process-title tests and verify GREEN**

Run:

```powershell
pnpm vitest run packages/session-core/src/processTitle
```

Expected: PASS for resolver, selector, provider, and poller tests.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- packages/session-core/src/processTitle/foregroundProcess.ts packages/session-core/src/processTitle/foregroundProcess.test.ts packages/session-core/src/processTitle/windowsProcessTree.ts packages/session-core/src/processTitle/windowsProcessTree.test.ts packages/session-core/src/index.ts
git diff --cached --check
git commit -m "feat(session-core): show runtime CLI tab titles"
```

---

### Task 3: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/troubleshooting.md`

**Interfaces:**
- Consumes: completed runtime CLI resolution behavior from Tasks 1-2.
- Produces: canonical maintainer guidance and user-facing troubleshooting notes.

- [ ] **Step 1: Document the title-resolution behavior**

Update the active-process paragraph in `CLAUDE.md` to state that Windows process-tree polling requests command lines and resolves Node entry scripts against cached package `bin` metadata, falling back to `node` when resolution is unavailable. Add a troubleshooting note explaining that only Node npm-bin resolution is supported in this version and remote apps still depend on OSC shell integration.

- [ ] **Step 2: Run focused and workspace verification**

Run, in order:

```powershell
pnpm vitest run packages/session-core/src/processTitle
pnpm vitest run packages/session-core/src
pnpm --filter @hypershell/session-core build
pnpm test
pnpm build
```

Expected: every command exits `0`. If a repository-wide command exposes an unrelated baseline failure, preserve its exact output and report focused feature status separately.

- [ ] **Step 3: Review the final diff for scope and safety**

Run:

```powershell
git status --short
git diff --check
git diff HEAD~2 -- packages/session-core/src/processTitle packages/session-core/src/index.ts CLAUDE.md docs/troubleshooting.md
```

Confirm no command lines cross the `ProcessNode` boundary, no hardcoded application mapping exists, and only this feature's files are modified.

- [ ] **Step 4: Commit documentation**

```powershell
git add -- CLAUDE.md docs/troubleshooting.md
git diff --cached --check
git commit -m "docs: explain runtime CLI tab titles"
```

## Self-review

- Spec coverage: command-line collection, generic package-bin resolution, caching, fallback behavior, privacy boundary, docs, and verification are each assigned to a task.
- Placeholder scan: no deferred implementation or unspecified tests remain.
- Type consistency: `NodeCliNameResolver(processName, commandLine)` feeds `WindowsProcessTreeDeps.resolveNodeCliName`; only `ProcessNode.displayName` reaches foreground selection.
