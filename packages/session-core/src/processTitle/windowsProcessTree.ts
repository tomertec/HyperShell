import type { ProcessNode, ProcessTreeProvider } from "./foregroundProcess";
import {
  createNodeCliNameResolver,
  type NodeCliNameResolver
} from "./nodeCliName";

// Loaded via require() at runtime (provided by esbuild banner's createRequire),
// exactly like node-pty — a static import would break the bundle on platforms
// where the module is absent.
declare const require: (id: string) => unknown;

export interface RawProcessTreeNode {
  pid: number;
  name: string;
  commandLine?: string;
  children?: RawProcessTreeNode[];
}

export interface WindowsProcessTreeModule {
  getProcessTree(
    rootPid: number,
    callback: (tree: RawProcessTreeNode | undefined) => void,
    flags?: number
  ): void;
}

export interface WindowsProcessTreeDeps {
  platform?: NodeJS.Platform;
  load?: () => WindowsProcessTreeModule;
  resolveNodeCliName?: NodeCliNameResolver;
}

/** If the native module accepts a call and never invokes its callback, give up rather than hang forever. */
const CALLBACK_TIMEOUT_MS = 2000;
const COMMAND_LINE_PROCESS_DATA_FLAG = 2;

function toProcessNode(
  raw: RawProcessTreeNode,
  resolveNodeCliName: NodeCliNameResolver
): ProcessNode {
  const displayName = resolveNodeCliName(raw.name, raw.commandLine);

  return {
    pid: raw.pid,
    name: raw.name,
    ...(displayName ? { displayName } : {}),
    children: (raw.children ?? []).map((child) => toProcessNode(child, resolveNodeCliName))
  };
}

function loadModule(): WindowsProcessTreeModule {
  return require("@vscode/windows-process-tree") as WindowsProcessTreeModule;
}

/**
 * Process trees come from a native module that only exists on Windows. Every
 * failure path resolves to null so a missing or unbuilt binding degrades the
 * tab title rather than breaking the session.
 */
export function createWindowsProcessTreeProvider(
  deps: WindowsProcessTreeDeps = {}
): ProcessTreeProvider {
  const platform = deps.platform ?? process.platform;
  const load = deps.load ?? loadModule;
  const resolveNodeCliName = deps.resolveNodeCliName ?? createNodeCliNameResolver();
  let cached: WindowsProcessTreeModule | null = null;
  let loadFailed = false;

  return (rootPid: number) =>
    new Promise<ProcessNode | null>((resolve) => {
      if (platform !== "win32" || loadFailed) {
        resolve(null);
        return;
      }

      if (!cached) {
        try {
          cached = load();
        } catch {
          loadFailed = true;
          resolve(null);
          return;
        }
      }

      let settled = false;
      const settle = (value: ProcessNode | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };

      const timer = setTimeout(() => settle(null), CALLBACK_TIMEOUT_MS);

      try {
        cached.getProcessTree(
          rootPid,
          (tree) => {
            settle(tree ? toProcessNode(tree, resolveNodeCliName) : null);
          },
          COMMAND_LINE_PROCESS_DATA_FLAG
        );
      } catch {
        settle(null);
      }
    });
}
