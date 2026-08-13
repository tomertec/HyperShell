import { readdir, open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Reads metadata for a Claude Code conversation so a restored tab can offer
 * "resume this session" with a human-readable label rather than a raw UUID.
 *
 * Sessions live at ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl. The
 * directory name is Claude's own encoding of the working directory, which is
 * undocumented, so this locates a session by scanning the project directories
 * for the exact filename instead of trying to reproduce that encoding.
 */

export interface ClaudeSessionInfo {
  sessionId: string;
  title: string | null;
  cwd: string | null;
  lastActiveAt: string;
}

/** Only the tail is read — enough to catch the newest ai-title line. */
const TAIL_BYTES = 64 * 1024;

function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

async function findSessionFile(sessionId: string): Promise<string | null> {
  let dirs: string[];
  try {
    dirs = await readdir(projectsRoot());
  } catch {
    return null;
  }

  const fileName = `${sessionId}.jsonl`;
  for (const dir of dirs) {
    const candidate = join(projectsRoot(), dir, fileName);
    try {
      const stats = await stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      // Not in this project directory; keep looking.
    }
  }

  return null;
}

async function readTail(path: string, bytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const length = size - start;
    if (length <= 0) {
      return "";
    }

    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * Scans backwards for the newest usable label. `ai-title` lines are rewritten
 * as the conversation evolves, so the last one wins; sessions too short to have
 * earned a title fall back to the first user prompt in the tail.
 */
export function extractSessionLabel(tail: string): { title: string | null; cwd: string | null } {
  const lines = tail.split("\n");
  let title: string | null = null;
  let cwd: string | null = null;
  let firstPrompt: string | null = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // The first line of a mid-file read is usually truncated.
      continue;
    }

    if (!title && parsed.type === "ai-title" && typeof parsed.aiTitle === "string") {
      title = parsed.aiTitle;
    }

    if (!cwd && typeof parsed.cwd === "string") {
      cwd = parsed.cwd;
    }

    if (!firstPrompt && parsed.type === "user") {
      const message = parsed.message as { content?: unknown } | undefined;
      if (typeof message?.content === "string" && message.content.trim()) {
        firstPrompt = message.content.trim().slice(0, 80);
      }
    }

    if (title && cwd) {
      break;
    }
  }

  return { title: title ?? firstPrompt, cwd };
}

/**
 * Returns null when the conversation no longer exists. Callers must treat that
 * as "do not offer resume": `claude --resume <missing-id>` prints
 * "No conversation found with session ID" and exits immediately, which would
 * kill the restored tab's shell instead of giving the user a terminal.
 */
export async function getClaudeSessionInfo(
  sessionId: string
): Promise<ClaudeSessionInfo | null> {
  const path = await findSessionFile(sessionId);
  if (!path) {
    return null;
  }

  const [stats, tail] = await Promise.all([
    stat(path),
    readTail(path, TAIL_BYTES).catch(() => ""),
  ]);
  const { title, cwd } = extractSessionLabel(tail);

  return {
    sessionId,
    title,
    cwd,
    lastActiveAt: stats.mtime.toISOString(),
  };
}
