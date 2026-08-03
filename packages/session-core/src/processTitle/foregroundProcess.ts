/** One process in a pty's descendant tree. */
export interface ProcessNode {
  pid: number;
  name: string;
  children: ProcessNode[];
}

/** Resolves a pid to its process tree. Returns null when unavailable. */
export type ProcessTreeProvider = (rootPid: number) => Promise<ProcessNode | null>;

/** Names that mean "no foreground program" — the shell itself, or console plumbing. */
const SHELL_AND_WRAPPER_NAMES = new Set([
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "sh",
  "zsh",
  "wsl",
  "conhost",
  "openconsole",
  "winpty-agent"
]);

function stripExe(name: string): string {
  return name.replace(/\.exe$/i, "");
}

function deepest(node: ProcessNode, depth: number): { node: ProcessNode; depth: number } {
  let best = { node, depth };

  for (const child of node.children) {
    const candidate = deepest(child, depth + 1);
    // >= so that, among equally deep branches, the last (most recently spawned)
    // child wins — that is the one the user just started.
    if (candidate.depth >= best.depth) {
      best = candidate;
    }
  }

  return best;
}

/**
 * The name to show for a pty, or null when the shell is sitting at its prompt.
 */
export function pickForegroundName(root: ProcessNode | null): string | null {
  if (!root) {
    return null;
  }

  const { node, depth } = deepest(root, 0);
  if (depth === 0) {
    return null;
  }

  const name = stripExe(node.name);
  if (SHELL_AND_WRAPPER_NAMES.has(name.toLowerCase())) {
    return null;
  }

  return name.length > 0 ? name : null;
}
