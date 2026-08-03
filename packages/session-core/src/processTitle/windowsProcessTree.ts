import type { ProcessNode, ProcessTreeProvider } from "./foregroundProcess";

// Loaded via require() at runtime (provided by esbuild banner's createRequire),
// exactly like node-pty — a static import would break the bundle on platforms
// where the module is absent.
declare const require: (id: string) => unknown;

export interface RawProcessTreeNode {
  pid: number;
  name: string;
  children?: RawProcessTreeNode[];
}

export interface WindowsProcessTreeModule {
  getProcessTree(
    rootPid: number,
    callback: (tree: RawProcessTreeNode | undefined) => void
  ): void;
}

export interface WindowsProcessTreeDeps {
  platform?: NodeJS.Platform;
  load?: () => WindowsProcessTreeModule;
}

function toProcessNode(raw: RawProcessTreeNode): ProcessNode {
  return {
    pid: raw.pid,
    name: raw.name,
    children: (raw.children ?? []).map(toProcessNode)
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

      try {
        cached.getProcessTree(rootPid, (tree) => {
          resolve(tree ? toProcessNode(tree) : null);
        });
      } catch {
        resolve(null);
      }
    });
}
