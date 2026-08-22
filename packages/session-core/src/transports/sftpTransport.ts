import { createReadStream as fsCreateReadStream, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import ssh2, { Client, type ConnectConfig, type SFTPWrapper, type Stats } from "ssh2";

// `utils` must come off the default export, not a named import. ssh2 is CommonJS
// and defines it as a nested object literal with a spread, which Node's ESM
// named-export detection (cjs-module-lexer) cannot see through — `Client` is
// detected, `utils` is not. Since esbuild keeps ssh2 external and emits ESM, a
// named `utils` import makes the bundled main process crash on load.
const { utils } = ssh2;

import type {
  SessionState,
  SessionTransportEvent,
  SftpConnectionOptions,
  SftpSecurityOptions
} from "./transportEvents";
import type { Ssh2ConnectionPool, Ssh2PoolTarget, ResolvedAuth } from "../ssh2ConnectionPool";

export type { SftpConnectionOptions } from "./transportEvents";

export interface KeyboardInteractivePrompt {
  prompt: string;
  echo: boolean;
}

export type KeyboardInteractiveCallback = (
  name: string,
  instructions: string,
  prompts: KeyboardInteractivePrompt[]
) => Promise<string[]>;

export interface SftpTransportOptions extends SftpSecurityOptions {
  pool?: Ssh2ConnectionPool;
  onKeyboardInteractive?: KeyboardInteractiveCallback;
}

export interface SftpEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
  permissions: number;
  owner: number;
  group: number;
}

export interface SftpUploadOptions {
  /**
   * Bytes already transferred by a previous interrupted upload of the same
   * file. Passing any number (0 included) opts into resumable mode: the temp
   * file gets a deterministic name so a later attempt can find it again, and
   * a partial is kept on failure instead of cleaned up. The partial is only
   * continued when its size matches this value exactly; anything else (a
   * stale temp from an older upload, a concurrent writer) starts over.
   */
  resumeOffset?: number;
  /** Called with cumulative bytes transferred as the local file streams up. */
  onProgress?: (bytesTransferred: number) => void;
  /** Abort mid-flight. A resumable upload keeps its partial temp file. */
  signal?: AbortSignal;
}

export interface SftpTransportHandle {
  connect(): Promise<void>;
  disconnect(): void;
  list(remotePath: string): Promise<SftpEntry[]>;
  stat(remotePath: string): Promise<SftpEntry>;
  chmod(remotePath: string, permissions: number): Promise<void>;
  mkdir(remotePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  remove(remotePath: string, recursive?: boolean): Promise<void>;
  readFile(remotePath: string): Promise<Buffer>;
  writeFile(remotePath: string, data: Buffer): Promise<void>;
  /**
   * Stream a local file to `remotePath` with the same guarantees as
   * `writeFile` — temp-and-rename atomicity, mode preservation, symlink
   * resolution — plus progress, abort, and resume. Every remote write goes
   * through `writeFile` or `upload`; there is deliberately no raw write
   * stream on this interface, so the invariant cannot be bypassed.
   */
  upload(localPath: string, remotePath: string, options?: SftpUploadOptions): Promise<void>;
  createReadStream(remotePath: string, options?: { start?: number }): Readable;
  onEvent(listener: (event: SessionTransportEvent) => void): () => void;
}

/** Collect all candidate key file paths in priority order. */
function collectKeyPaths(options: SftpConnectionOptions): string[] {
  const paths: string[] = [];
  if (options.privateKeyPath) paths.push(options.privateKeyPath);
  if (options.fallbackKeyPaths) {
    for (const p of options.fallbackKeyPaths) {
      if (!paths.includes(p)) paths.push(p);
    }
  }
  return paths;
}

interface PosixRenameCapable {
  ext_openssh_rename?: (from: string, to: string, cb: (err?: Error | null) => void) => void;
}

/**
 * Thrown by `renameWithOverwrite`'s last-resort step when the destination was
 * already unlinked but the rename meant to replace it then also failed. At
 * that point `from` — not `to` — holds the only surviving copy of the data,
 * so callers must not delete it on this specific failure.
 */
export interface OverwriteRenameError extends Error {
  destinationRemoved?: true;
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
      // ext_openssh_rename throws synchronously (not via the callback) when
      // the server hasn't advertised the extension. That throw happens
      // inside this Promise executor, so it still lands here as a rejection.
      await callbackToPromise((cb) => posixRename.call(sftpSession, from, to, cb));
      return;
    } catch {
      // Advertised but refused, or unsupported — fall through to the portable path.
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

  try {
    await callbackToPromise((cb) => sftpSession.rename(from, to, cb));
  } catch (finalError) {
    // The destination is already gone — tag the error so writeFile knows
    // `from` is now the only copy and must not be cleaned up.
    const tagged: OverwriteRenameError =
      finalError instanceof Error ? finalError : new Error(String(finalError));
    tagged.destinationRemoved = true;
    throw tagged;
  }
}

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as Error & { code?: number }).code === utils.sftp.STATUS_CODE.PERMISSION_DENIED
  );
}

const MAX_FILENAME_BYTES = 255;

/**
 * Truncate `baseName` (by bytes, since filesystem name limits are byte-based,
 * not character-based) so that wrapping it in the temp-file name still fits
 * under the common 255-byte filename limit. Without this, a save that used to
 * work for a long filename starts failing purely because of the added suffix.
 */
export function truncateForTempName(baseName: string, reservedBytes: number): string {
  const budget = MAX_FILENAME_BYTES - reservedBytes;
  if (Buffer.byteLength(baseName) <= budget) {
    return baseName;
  }

  // Slicing a UTF-8 buffer can land mid-character; toString("utf8") replaces
  // the truncated tail with U+FFFD, so strip that before returning.
  return Buffer.from(baseName).subarray(0, budget).toString("utf8").replace(/\uFFFD+$/, "");
}

/**
 * Matches the sibling temp files `writeFile` and `upload` create. Exposed so
 * directory scanners (sync) can recognise a temp stranded by a killed process
 * or a never-resumed transfer and skip it rather than treat it as content.
 */
export const REMOTE_WRITE_TEMP_NAME = /\.hypershell-(?:[0-9a-f]{12}|upload)\.tmp$/;

/**
 * Resumable uploads need a deterministic temp name \u2014 a later attempt has to
 * find the partial the interrupted one left. Non-resumable writes keep a
 * random suffix so concurrent writers to the same path can't clobber each
 * other's temp file.
 */
const RESUMABLE_TEMP_SUFFIX = ".hypershell-upload.tmp";

function randomTempSuffix(): string {
  return `.hypershell-${randomBytes(6).toString("hex")}.tmp`;
}

interface SiblingTempPath {
  tempPath: string;
  directory: string;
  hasDirectoryPrefix: boolean;
}

function buildSiblingTempPath(targetPath: string, tempSuffix: string): SiblingTempPath {
  const slashIndex = targetPath.lastIndexOf("/");
  const hasDirectoryPrefix = slashIndex >= 0;
  const directory = slashIndex > 0 ? targetPath.slice(0, slashIndex) : "";
  const baseName = targetPath.slice(slashIndex + 1);
  const truncatedBaseName = truncateForTempName(baseName, 1 + Buffer.byteLength(tempSuffix));
  const tempName = `.${truncatedBaseName}${tempSuffix}`;
  return {
    tempPath: hasDirectoryPrefix ? `${directory}/${tempName}` : tempName,
    directory,
    hasDirectoryPrefix
  };
}

/**
 * Renaming over `remotePath` would replace a symlink with a regular file
 * (e.g. a dotfile symlinked into a repo would silently detach from it).
 * Resolve to the real target first so the temp write and rename land there
 * instead, leaving the symlink itself untouched.
 */
async function resolveWriteTarget(sftpSession: SFTPWrapper, remotePath: string): Promise<string> {
  try {
    const linkStats = await new Promise<Stats>((resolve, reject) => {
      sftpSession.lstat(remotePath, (error, stats) => (error ? reject(error) : resolve(stats)));
    });
    if (linkStats.isSymbolicLink()) {
      return await new Promise<string>((resolve, reject) => {
        sftpSession.realpath(remotePath, (error, absPath) => (error ? reject(error) : resolve(absPath)));
      });
    }
  } catch {
    // New file, broken link, or the server refused lstat \u2014 write at the
    // requested path unchanged.
  }
  return remotePath;
}

function unlinkQuietly(sftpSession: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise<void>((resolve) => {
    sftpSession.unlink(remotePath, () => resolve());
  });
}

function tempCreateDeniedError(remotePath: string, temp: SiblingTempPath, error: unknown): Error {
  const parentLabel = temp.hasDirectoryPrefix
    ? `"${temp.directory === "" ? "/" : temp.directory}"`
    : "its directory";
  return new Error(
    `Cannot save "${remotePath}": no write permission on ${parentLabel}. ` +
      "An atomic save creates a temporary file next to the original first, which needs " +
      "write access to the directory itself, not just the file.",
    { cause: error }
  );
}

/**
 * Final step of every atomic write: rename the fully-written temp file over
 * the target. On the specific failure where the destination was unlinked but
 * the replacement rename then failed, the temp file is the only surviving
 * copy \u2014 it is always kept and the error says where it is.
 */
async function renameTempIntoPlace(
  sftpSession: SFTPWrapper,
  tempPath: string,
  targetPath: string,
  keepTempOnFailure: boolean
): Promise<void> {
  try {
    await renameWithOverwrite(sftpSession, tempPath, targetPath);
  } catch (error) {
    if (error instanceof Error && (error as OverwriteRenameError).destinationRemoved) {
      throw new Error(
        `Save failed while replacing "${targetPath}": the original was removed but could not ` +
          `be restored. Your content was NOT lost \u2014 it is saved at "${tempPath}"; move it into ` +
          "place manually.",
        { cause: error }
      );
    }

    if (!keepTempOnFailure) {
      await unlinkQuietly(sftpSession, tempPath);
    }
    throw error;
  }
}

export function buildConnectConfig(
  options: SftpConnectionOptions,
  keyPath?: string,
  securityOptions?: SftpSecurityOptions
): ConnectConfig {
  // Strip Windows domain prefix (e.g. "DOMAIN\user" → "user") — SSH servers
  // don't understand Windows domain usernames.
  let sshUsername = options.username;
  if (sshUsername && sshUsername.includes("\\")) {
    sshUsername = sshUsername.split("\\").pop();
  }

  const config: ConnectConfig = {
    host: options.hostname,
    port: options.port ?? 22,
    username: sshUsername,
    keepaliveInterval: (options.keepAliveSeconds ?? 60) * 1000
  };

  if (keyPath) {
    try {
      config.privateKey = readFileSync(keyPath);
    } catch {
      // Key file unreadable — skip.
    }
  }

  if (options.passphrase) {
    config.passphrase = options.passphrase;
  }

  const agentPath = options.agentPath ?? process.env.SSH_AUTH_SOCK;
  if (agentPath) {
    config.agent = agentPath;
  }

  if (options.password) {
    config.password = options.password;
  }

  // Enable keyboard-interactive auth to support 2FA/MFA prompts
  config.tryKeyboard = true;

  const trustedFingerprints = new Set(securityOptions?.trustedHostFingerprints ?? []);
  if (trustedFingerprints.size > 0) {
    config.hostVerifier = (key: Buffer) => {
      const fingerprint = `SHA256:${createHash("sha256").update(key).digest("base64")}`;
      return trustedFingerprints.has(fingerprint);
    };
  }

  return config;
}

function buildEntry(path: string, attrs: Stats): SftpEntry {
  const name = path.split("/").filter(Boolean).at(-1) ?? path;
  const mode = attrs.mode ?? 0;
  return {
    name,
    path,
    size: attrs.size ?? 0,
    modifiedAt: new Date((attrs.mtime ?? 0) * 1000).toISOString(),
    isDirectory: (mode & 0o40000) !== 0,
    permissions: mode & 0o7777,
    owner: attrs.uid ?? 0,
    group: attrs.gid ?? 0
  };
}

// Directory entry names are chosen by the remote server, and callers join them
// into local paths (downloads, sync). A hostile server can answer readdir with
// "../../evil" or "..\\evil" and escape the destination directory, so names
// that aren't a single path component are dropped at this boundary.
function isSafeEntryName(name: string): boolean {
  if (name === "." || name === "..") return false;
  return !/[/\\\0]/.test(name);
}

function combineRemotePath(parentPath: string, name: string): string {
  const normalizedParent = parentPath.endsWith("/")
    ? parentPath.slice(0, -1)
    : parentPath;
  if (normalizedParent.length === 0) {
    return `/${name}`;
  }

  return `${normalizedParent}/${name}`;
}

function resolveAuth(options: SftpConnectionOptions): ResolvedAuth {
  if (options.authMethod === "password" && options.password) {
    return { type: "password", password: options.password };
  }
  if (options.authMethod === "agent" || options.agentPath || process.env.SSH_AUTH_SOCK) {
    return { type: "agent", agent: options.agentPath ?? process.env.SSH_AUTH_SOCK ?? "" };
  }
  if (options.privateKeyPath) {
    try {
      const privateKey = readFileSync(options.privateKeyPath);
      return { type: "key", privateKey, passphrase: options.passphrase };
    } catch {
      // Fall through
    }
  }
  // Default to password if available
  if (options.password) {
    return { type: "password", password: options.password };
  }
  return { type: "agent", agent: process.env.SSH_AUTH_SOCK ?? "" };
}

export function createSftpTransport(
  sessionId: string,
  options: SftpConnectionOptions,
  transportOptions?: SftpTransportOptions
): SftpTransportHandle {
  const listeners = new Set<(event: SessionTransportEvent) => void>();
  let client: Client | null = null;
  let sftp: SFTPWrapper | null = null;
  let poolConnectionId: string | null = null;
  let poolConsumerId: string | null = null;
  const pool = transportOptions?.pool;

  const emit = (event: SessionTransportEvent) => {
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(event);
      }
    });
  };

  const emitStatus = (state: SessionState) => {
    emit({ type: "status", sessionId, state });
  };

  const emitError = (message: string) => {
    emit({ type: "error", sessionId, message });
  };

  const requireSftp = (): SFTPWrapper => {
    if (!sftp) {
      throw new Error("SFTP session not connected");
    }

    return sftp;
  };

  function tryConnect(connectConfig: ConnectConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const conn = new Client();
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        conn.removeAllListeners();
        reject(error);
      };

      conn.on("ready", () => {
        conn.sftp((error, sftpSession) => {
          if (error) {
            fail(error);
            return;
          }
          if (settled) return;

          settled = true;
          client = conn;
          sftp = sftpSession;

          conn.on("close", () => {
            sftp = null;
            client = null;
            emitStatus("disconnected");
          });

          resolve();
        });
      });

      conn.on("error", fail);

      // Handle keyboard-interactive auth (2FA, TOTP, etc.)
      const onKbdInteractive = transportOptions?.onKeyboardInteractive;
      if (onKbdInteractive) {
        conn.on("keyboard-interactive", (name, instructions, _instructionsLang, prompts, finish) => {
          const mappedPrompts = prompts.map((p) => ({
            prompt: p.prompt,
            echo: p.echo ?? false,
          }));
          onKbdInteractive(name, instructions, mappedPrompts)
            .then((responses) => {
              finish(responses);
            })
            .catch(() => {
              // User cancelled or error — send empty responses so server rejects
              finish(prompts.map(() => ""));
            });
        });
      }

      conn.connect(connectConfig);
    });
  }

  async function connect(): Promise<void> {
    emitStatus("connecting");

    // If pool is provided, use pooled connection
    if (pool) {
      try {
        const target: Ssh2PoolTarget = {
          hostname: options.hostname,
          port: options.port ?? 22,
          username: options.username ?? "",
          auth: resolveAuth(options),
          keepAliveSeconds: options.keepAliveSeconds,
        };

        const pooled = await pool.acquire(target);
        poolConnectionId = pooled.connectionId;
        poolConsumerId = pooled.consumerId;
        client = pooled.client;

        // Get SFTP session from the pooled client
        sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
          pooled.client.sftp((err, sftpSession) => {
            if (err) reject(err);
            else resolve(sftpSession);
          });
        });

        emitStatus("connected");
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitError(message);
        emitStatus("failed");
        throw error;
      }
    }

    // Collect all candidate key paths and try each one sequentially,
    // just like the system ssh binary does.
    const keyPaths = collectKeyPaths(options);
    const attempts = keyPaths.length > 0 ? keyPaths : [undefined];

    let lastError: Error | null = null;
    for (const keyPath of attempts) {
      const config = buildConnectConfig(options, keyPath, transportOptions);

      try {
        await tryConnect(config);
        emitStatus("connected");
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    emitError(lastError?.message ?? "All authentication methods failed");
    emitStatus("failed");
    throw lastError ?? new Error("All authentication methods failed");
  }

  function disconnect(): void {
    if (pool && poolConnectionId && poolConsumerId) {
      const activeSftp = sftp as { end?: () => void } | null;
      try {
        activeSftp?.end?.();
      } catch {
        // Best effort: the underlying pooled SSH client is still released below.
      }

      // Release back to pool — don't end the client
      pool.release(poolConnectionId, poolConsumerId);
      poolConnectionId = null;
      poolConsumerId = null;
      client = null;
      sftp = null;
      return;
    }

    if (!client) {
      return;
    }

    client.end();
    client = null;
    sftp = null;
  }

  async function list(remotePath: string): Promise<SftpEntry[]> {
    const sftpSession = requireSftp();
    return await new Promise<SftpEntry[]>((resolve, reject) => {
      sftpSession.readdir(remotePath, (error, entries) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(
          (entries ?? [])
            .filter((entry) => isSafeEntryName(entry.filename))
            .map((entry) => {
              const path = combineRemotePath(remotePath, entry.filename);
              return {
                ...buildEntry(path, entry.attrs),
                name: entry.filename
              };
            })
        );
      });
    });
  }

  async function stat(remotePath: string): Promise<SftpEntry> {
    const sftpSession = requireSftp();
    return await new Promise<SftpEntry>((resolve, reject) => {
      sftpSession.stat(remotePath, (error, attrs) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(buildEntry(remotePath, attrs));
      });
    });
  }

  async function mkdir(remotePath: string): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.mkdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function chmod(remotePath: string, permissions: number): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.chmod(remotePath, permissions & 0o7777, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function rename(oldPath: string, newPath: string): Promise<void> {
    const sftpSession = requireSftp();
    await new Promise<void>((resolve, reject) => {
      sftpSession.rename(oldPath, newPath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function remove(remotePath: string, recursive = false): Promise<void> {
    const sftpSession = requireSftp();
    const entry = await stat(remotePath);

    if (!entry.isDirectory) {
      await new Promise<void>((resolve, reject) => {
        sftpSession.unlink(remotePath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      return;
    }

    if (recursive) {
      const entries = await list(remotePath);
      for (const child of entries) {
        if (child.isDirectory) {
          await remove(child.path, true);
          continue;
        }

        await new Promise<void>((resolve, reject) => {
          sftpSession.unlink(child.path, (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      sftpSession.rmdir(remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function readFile(remotePath: string): Promise<Buffer> {
    const MAX_READ_SIZE = 10 * 1024 * 1024; // 10 MB
    const entry = await stat(remotePath);
    if (entry.size > MAX_READ_SIZE) {
      throw new Error(
        `File too large to open in editor (${(entry.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_READ_SIZE / 1024 / 1024} MB)`
      );
    }

    const sftpSession = requireSftp();
    const stream = sftpSession.createReadStream(remotePath);
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: string | Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  // A fresh temp file is created with default permissions, so an existing
  // file's mode has to be carried across explicitly or the rename silently
  // resets it.
  async function statModeOrNull(targetPath: string): Promise<number | null> {
    try {
      return (await stat(targetPath)).permissions;
    } catch {
      return null;
    }
  }

  async function preserveMode(tempPath: string, originalMode: number | null): Promise<void> {
    if (originalMode == null) {
      return;
    }
    try {
      await chmod(tempPath, originalMode);
    } catch {
      // Best-effort mode preservation, matching the stat failure above:
      // a server that refuses SETSTAT (e.g. answers chmod with
      // OP_UNSUPPORTED) must not fail the entire save over it. Accepted
      // trade-off: on such a server, a file that was 0600 lands at the
      // server's default mode (commonly 0644) after this save — worse
      // than losing the permission bit is losing the edit outright.
    }
  }

  /**
   * Write via a sibling temp file and rename into place. A dropped connection
   * then leaves a stray temp file rather than a truncated original — the
   * previous implementation streamed straight onto the live path.
   */
  async function writeFile(remotePath: string, data: Buffer): Promise<void> {
    const sftpSession = requireSftp();
    const targetPath = await resolveWriteTarget(sftpSession, remotePath);
    const temp = buildSiblingTempPath(targetPath, randomTempSuffix());
    const originalMode = await statModeOrNull(targetPath);

    try {
      await new Promise<void>((resolve, reject) => {
        const stream = sftpSession.createWriteStream(temp.tempPath);
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(data);
      });
    } catch (error) {
      // The open itself may have failed (nothing to clean up) or a later
      // write/I-O error may have left a partial temp file behind (e.g. quota
      // exceeded) — unlink unconditionally, best-effort, before classifying.
      await unlinkQuietly(sftpSession, temp.tempPath);

      if (isPermissionDenied(error)) {
        throw tempCreateDeniedError(remotePath, temp, error);
      }
      throw error;
    }

    await preserveMode(temp.tempPath, originalMode);
    await renameTempIntoPlace(sftpSession, temp.tempPath, targetPath, false);
  }

  async function upload(
    localPath: string,
    remotePath: string,
    uploadOptions: SftpUploadOptions = {}
  ): Promise<void> {
    const sftpSession = requireSftp();
    const targetPath = await resolveWriteTarget(sftpSession, remotePath);
    const resumable = uploadOptions.resumeOffset != null;
    const temp = buildSiblingTempPath(
      targetPath,
      resumable ? RESUMABLE_TEMP_SUFFIX : randomTempSuffix()
    );
    const originalMode = await statModeOrNull(targetPath);

    const resumeOffset = uploadOptions.resumeOffset ?? 0;
    let startOffset = 0;
    if (resumable && resumeOffset > 0) {
      try {
        if ((await stat(temp.tempPath)).size === resumeOffset) {
          startOffset = resumeOffset;
        }
      } catch {
        // No partial temp file — start over from zero.
      }
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const signal = uploadOptions.signal;
        const localStream =
          startOffset > 0
            ? fsCreateReadStream(localPath, { start: startOffset })
            : fsCreateReadStream(localPath);
        const remoteStream =
          startOffset > 0
            ? sftpSession.createWriteStream(temp.tempPath, { start: startOffset, flags: "r+" })
            : sftpSession.createWriteStream(temp.tempPath);

        let settled = false;
        const cleanup = () => {
          localStream.removeAllListeners();
          remoteStream.removeAllListeners();
        };
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };

        let bytesTransferred = startOffset;
        localStream.on("data", (chunk: string | Buffer) => {
          bytesTransferred += chunk.length;
          uploadOptions.onProgress?.(bytesTransferred);
        });

        const abortHandler = () => {
          settle(() => {
            // Break the pipe first to prevent further writes into a destroyed stream.
            localStream.unpipe(remoteStream);
            // Swallow expected stream teardown errors after cancellation.
            localStream.once("error", () => {});
            remoteStream.once("error", () => {});
            localStream.destroy();
            remoteStream.destroy();
            cleanup();
            reject(new Error("Upload aborted"));
          });
        };

        if (signal?.aborted) {
          abortHandler();
          return;
        }
        signal?.addEventListener("abort", abortHandler, { once: true });

        remoteStream.on("close", () => {
          signal?.removeEventListener("abort", abortHandler);
          if (signal?.aborted) {
            settle(() => {
              cleanup();
              reject(new Error("Upload aborted"));
            });
            return;
          }
          settle(() => {
            cleanup();
            resolve();
          });
        });
        remoteStream.on("error", (error: Error) => {
          signal?.removeEventListener("abort", abortHandler);
          settle(() => {
            cleanup();
            reject(error);
          });
        });
        localStream.on("error", (error: Error) => {
          signal?.removeEventListener("abort", abortHandler);
          settle(() => {
            cleanup();
            reject(error);
          });
        });

        localStream.pipe(remoteStream);
      });
    } catch (error) {
      // A resumable partial is the resume file — keep it so a later attempt
      // can continue where this one died. A non-resumable temp is a stray —
      // remove it, best-effort, before classifying.
      if (!resumable) {
        await unlinkQuietly(sftpSession, temp.tempPath);
      }
      if (isPermissionDenied(error)) {
        throw tempCreateDeniedError(remotePath, temp, error);
      }
      throw error;
    }

    await preserveMode(temp.tempPath, originalMode);
    // A fully-written resumable temp is also kept when the rename fails: a
    // retry finds it already at full size, skips the re-upload, and retries
    // just the rename.
    await renameTempIntoPlace(sftpSession, temp.tempPath, targetPath, resumable);
  }

  function createReadStream(remotePath: string, options?: { start?: number }): Readable {
    return requireSftp().createReadStream(remotePath, options);
  }

  function onEvent(listener: (event: SessionTransportEvent) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    connect,
    disconnect,
    list,
    stat,
    chmod,
    mkdir,
    rename,
    remove,
    readFile,
    writeFile,
    upload,
    createReadStream,
    onEvent
  };
}
