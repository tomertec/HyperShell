export interface CacheEntry {
  password: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MIN_TTL_MS = 1_000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function normalizePort(port: number): number {
  const parsed = Number.isFinite(port) ? Math.floor(port) : 22;
  return Math.max(1, parsed);
}

function normalizeUser(user: string): string {
  return user.trim();
}

function normalizeTtlMs(ttlMs: number): number {
  const parsed = Number.isFinite(ttlMs) ? Math.floor(ttlMs) : DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, parsed));
}

export function cacheKey(host: string, port: number, user: string): string {
  return `${normalizeHost(host)}:${normalizePort(port)}:${normalizeUser(user)}`;
}

export function set(
  host: string,
  port: number,
  user: string,
  password: string,
  ttlMs = DEFAULT_TTL_MS
): void {
  if (!password) {
    return;
  }

  cache.set(cacheKey(host, port, user), {
    password,
    expiresAt: Date.now() + normalizeTtlMs(ttlMs),
  });
}

export function get(
  host: string,
  port: number,
  user: string,
  ttlMs = DEFAULT_TTL_MS
): string | null {
  const key = cacheKey(host, port, user);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  // Sliding expiration: successful reads extend inactivity timeout.
  entry.expiresAt = now + normalizeTtlMs(ttlMs);
  cache.set(key, entry);
  return entry.password;
}

export function clearAll(): void {
  cache.clear();
}
