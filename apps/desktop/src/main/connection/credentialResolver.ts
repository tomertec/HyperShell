import type { HostRecord as DbHostRecord } from "@hypershell/db";

/**
 * Credential resolution shared by the SSH terminal and the SFTP transport.
 *
 * Both transports answer the same two questions before connecting — "which
 * host record does this profileId mean?" and "what secret authenticates it?" —
 * and both used to answer them with their own copy of the logic inside
 * registerIpc.ts. The copies had drifted. This module is the single answer.
 *
 * What is deliberately NOT here: ~/.ssh/config handling. The system `ssh`
 * binary reads it itself, while ssh2 cannot, so the SFTP path reconstructs it
 * via `ssh -G` (see sftpConnectionOptions.ts). That asymmetry is correct and
 * belongs to the transports, not to credentials.
 */

/** The slice of the hosts repository this module needs. */
export interface HostLookup {
  get(id: string): DbHostRecord | undefined;
  list(): DbHostRecord[];
}

export type AuthTraceTransport = "ssh" | "sftp";

export interface CredentialResolverDeps {
  /** Null when SQLite failed to open — resolution then yields no host. */
  hosts: () => HostLookup | null;
  /** Reads a saved password out of secure storage (DPAPI). */
  readStoredPassword: (host: {
    authMethod?: string | null;
    authProfileId?: string | null;
  }) => string | null;
  /** Resolves an `op://` reference through the 1Password CLI. */
  readOnePasswordReference: (reference: string) => Promise<string>;
  /** In-memory credential cache lookup; returns null on miss. */
  readCachedCredential: (
    hostname: string,
    port: number,
    username: string,
    ttlMs: number
  ) => string | null;
  credentialCacheConfig: () => { enabled: boolean; ttlMs: number };
  trace: (
    transport: AuthTraceTransport,
    message: string,
    details?: Record<string, unknown>
  ) => void;
}

export interface FindHostOptions {
  /**
   * Also match a `user@hostname` destination string, as typed into Quick
   * Connect. Only the SSH path accepts these today.
   */
  matchDestination: boolean;
}

export interface ResolvePasswordOptions {
  transport: AuthTraceTransport;
  /** A password already supplied (SFTP's auth modal). Short-circuits lookup. */
  existing?: string;
  /**
   * When present, consult the in-memory credential cache before secure
   * storage. Only the SFTP path does this today.
   */
  cacheLookup?: { hostname: string; port: number; username: string };
}

export interface CredentialResolver {
  findHost(profileId: string, options: FindHostOptions): DbHostRecord | null;
  resolvePassword(
    host: DbHostRecord | null,
    options: ResolvePasswordOptions
  ): Promise<string | undefined>;
}

export function createCredentialResolver(
  deps: CredentialResolverDeps
): CredentialResolver {
  function findHost(
    profileId: string,
    options: FindHostOptions
  ): DbHostRecord | null {
    const repo = deps.hosts();
    if (!repo) {
      return null;
    }

    const direct = repo.get(profileId);
    if (direct) {
      return direct;
    }

    const match = repo
      .list()
      .find(
        (candidate) =>
          candidate.id === profileId ||
          candidate.name === profileId ||
          candidate.hostname === profileId ||
          (options.matchDestination &&
            profileId === `${candidate.username}@${candidate.hostname}`)
      );

    return match ?? null;
  }

  async function resolvePassword(
    host: DbHostRecord | null,
    options: ResolvePasswordOptions
  ): Promise<string | undefined> {
    const { transport, existing, cacheLookup } = options;

    if (existing) {
      deps.trace(transport, "Using explicit password from prompt", {
        hostId: host?.id ?? null
      });
      return existing;
    }

    if (cacheLookup) {
      const config = deps.credentialCacheConfig();
      if (config.enabled && cacheLookup.username) {
        const cached = deps.readCachedCredential(
          cacheLookup.hostname,
          cacheLookup.port,
          cacheLookup.username,
          config.ttlMs
        );
        if (cached) {
          deps.trace(
            transport,
            "Loaded password from in-memory credential cache",
            { hostId: host?.id ?? null }
          );
          return cached;
        }
      }
    }

    if (!host) {
      return undefined;
    }

    const authMethod = host.authMethod;

    if (authMethod === "password") {
      try {
        const saved = deps.readStoredPassword(host);
        if (saved) {
          deps.trace(transport, "Loaded saved password from secure storage", {
            hostId: host.id,
            authProfileId: host.authProfileId ?? null
          });
          return saved;
        }
        deps.trace(
          transport,
          "Password auth selected but no saved password found",
          { hostId: host.id, authProfileId: host.authProfileId ?? null }
        );
      } catch (error) {
        console.error(
          "[auth] failed to resolve saved host password:",
          error instanceof Error ? error.message : "unknown error"
        );
      }
    }

    if (authMethod === "op-reference" && host.opReference) {
      try {
        const credential = await deps.readOnePasswordReference(
          host.opReference
        );
        if (credential.length > 0) {
          deps.trace(transport, "Resolved credential from 1Password reference", {
            hostId: host.id
          });
          return credential;
        }
      } catch (error) {
        console.error(
          "[1password] failed to resolve reference:",
          error instanceof Error ? error.message : "unknown error"
        );
      }
    }

    return undefined;
  }

  return { findHost, resolvePassword };
}
