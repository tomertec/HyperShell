import { basename } from "node:path";

/**
 * Builds the line typed into a restored local shell to reattach it to the
 * Claude Code conversation the tab was running when HyperShell last closed.
 *
 * The renderer supplies only a UUID (see claudeSessionArgs.ts for the same
 * rule on the launch-args path); the working directory comes from Claude's own
 * session file, read in main. Neither value is interpolated raw — the id must
 * match a UUID and the path is quoted for the shell family being typed into,
 * so a directory name containing a quote cannot end the argument.
 *
 * An unrecognised shell returns null rather than guessing at quoting: a
 * restored tab with a plain prompt is a much better failure than one whose
 * first line is a mangled command.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ShellFamily = "powershell" | "cmd" | "posix";

export function detectShellFamily(executable: string): ShellFamily | null {
  const name = basename(executable).toLowerCase().replace(/\.exe$/, "");

  if (name === "powershell" || name === "pwsh") {
    return "powershell";
  }

  if (name === "cmd") {
    return "cmd";
  }

  // wsl.exe drops the user straight into a login shell, so it quotes like one.
  if (["bash", "sh", "zsh", "wsl", "busybox"].includes(name)) {
    return "posix";
  }

  return null;
}

function quote(family: ShellFamily, value: string): string {
  if (family === "powershell") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (family === "cmd") {
    // cmd has no escape for a quote inside a quoted string; a path containing
    // one is refused by the caller instead.
    return `"${value}"`;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface ClaudeResumeCommandInput {
  executable: string;
  claudeSessionId: string;
  cwd: string | null;
}

export function buildClaudeResumeCommand({
  executable,
  claudeSessionId,
  cwd,
}: ClaudeResumeCommandInput): string | null {
  if (!UUID_PATTERN.test(claudeSessionId)) {
    return null;
  }

  const family = detectShellFamily(executable);
  if (!family) {
    return null;
  }

  const resume = `claude --resume ${claudeSessionId}`;

  // A newline would run the fragment before it as its own command, and cmd
  // cannot express a quote inside a quoted path at all. Resuming in whatever
  // directory the shell opened in beats typing either one.
  if (cwd === null || /[\r\n]/.test(cwd)) {
    return resume;
  }

  if (family === "cmd" && cwd.includes('"')) {
    return resume;
  }

  const target = quote(family, cwd);

  if (family === "powershell") {
    return `Set-Location -LiteralPath ${target}; ${resume}`;
  }

  if (family === "cmd") {
    // /d is required: without it a cd across drives silently does nothing.
    return `cd /d ${target} && ${resume}`;
  }

  return `cd ${target} && ${resume}`;
}
