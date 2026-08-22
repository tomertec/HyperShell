import { watch, type FSWatcher } from "node:fs";
import { readdir, open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ClaudeSessionFile } from "./claudeSessionBinder";

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

/** Conversation files are named for their id; anything else is not one. */
const SESSION_FILE_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/**
 * Conversation files touched at or after `sinceMs`, across every project.
 *
 * Runs once per Claude launch rather than on a timer: a full walk of the
 * session store is cheap enough occasionally and far too expensive to poll.
 * Live changes are picked up by watchClaudeSessions instead.
 */
export async function scanRecentClaudeSessions(
  sinceMs: number
): Promise<ClaudeSessionFile[]> {
  const root = projectsRoot();
  const directories = await readdir(root, { withFileTypes: true });

  const perDirectory = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        let names: string[];
        try {
          names = await readdir(join(root, entry.name));
        } catch {
          return [];
        }

        const files = await Promise.all(
          names.map(async (name) => {
            const match = SESSION_FILE_PATTERN.exec(name);
            if (!match) {
              return null;
            }

            try {
              const stats = await stat(join(root, entry.name, name));
              if (stats.mtimeMs < sinceMs) {
                return null;
              }

              return {
                claudeSessionId: match[1],
                directory: entry.name,
                mtimeMs: stats.mtimeMs,
              };
            } catch {
              return null;
            }
          })
        );

        return files.filter((file): file is ClaudeSessionFile => file !== null);
      })
  );

  return perDirectory.flat();
}

/**
 * Reports conversation files as they are written.
 *
 * Returns null when the session store cannot be watched — no Claude directory
 * yet, or a platform that refuses a recursive watch. Callers degrade to the
 * one-shot scan, which is enough for a conversation that has already begun.
 */
export function watchClaudeSessions(
  onChange: (file: ClaudeSessionFile) => void
): (() => void) | null {
  let watcher: FSWatcher;

  try {
    watcher = watch(projectsRoot(), { recursive: true, persistent: false });
  } catch {
    return null;
  }

  watcher.on("error", () => {
    watcher.close();
  });

  watcher.on("change", (_event, filename) => {
    if (typeof filename !== "string") {
      return;
    }

    const segments = filename.split(/[\\/]/);
    const name = segments.pop();
    const directory = segments.pop();
    if (!name || !directory) {
      return;
    }

    const match = SESSION_FILE_PATTERN.exec(name);
    if (!match) {
      return;
    }

    onChange({
      claudeSessionId: match[1],
      directory,
      // The event is the write, so "now" is the modification time.
      mtimeMs: Date.now(),
    });
  });

  return () => {
    watcher.close();
  };
}
