/** One process in a pty's descendant tree. */
export interface ProcessNode {
  pid: number;
  name: string;
  displayName?: string;
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

/**
 * Remote/relay clients — a different reason to return null than
 * SHELL_AND_WRAPPER_NAMES. A shell being deepest means nothing is running;
 * one of these being deepest means something IS running, but only the far
 * end knows its name (e.g. `ssh host` then `llmtop` on the remote — the
 * local tree only ever sees `ssh`). Returning null here lets the remote's
 * own OSC title win instead of masking it with "ssh". The trade-off: ssh'ing
 * to a host with no shell integration leaves the tab showing whatever OSC
 * title was last set, since there is no local answer to fall back to.
 */
const PASSTHROUGH_NAMES = new Set(["ssh", "mosh", "plink", "telnet"]);

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
  const lowerName = name.toLowerCase();
  if (SHELL_AND_WRAPPER_NAMES.has(lowerName) || PASSTHROUGH_NAMES.has(lowerName)) {
    return null;
  }

  return node.displayName ?? (name.length > 0 ? name : null);
}
