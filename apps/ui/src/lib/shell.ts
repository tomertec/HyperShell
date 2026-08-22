/**
 * The one seam between the renderer and the preload bridge.
 *
 * Every renderer module calls `getShell()` instead of touching
 * `window.hypershell` directly (enforced by ESLint `no-restricted-properties`).
 * Three behaviours, by situation:
 *
 * - Bridge absent (plain-browser dev, Playwright specs that inject nothing):
 *   methods are benign stubs — async methods resolve `undefined`, `on*`
 *   listeners return a no-op unsubscribe — matching what the old
 *   `window.hypershell?.method?.()` chains evaluated to.
 * - Bridge present but a declared method missing (preload drift — the class of
 *   bug that made the Tunnel Manager buttons silent no-ops): the access
 *   THROWS with the method name, instead of resolving `undefined`.
 * - Tests: `setShell(fake)` substitutes the whole far side in-memory.
 */

export type ShellApi = Required<NonNullable<Window["hypershell"]>>;

let override: ShellApi | null = null;

export function setShell(api: ShellApi | null): void {
  override = api;
}

export function hasShell(): boolean {
  return override != null || window.hypershell != null;
}

/** Properties probed by Promise resolution / React internals — never bridge methods. */
const PROBE_PROPS = new Set(["then", "toJSON", "$$typeof"]);

function bridgelessStub(prop: string): unknown {
  if (prop.startsWith("on")) {
    return () => () => {};
  }
  return () => Promise.resolve(undefined);
}

const bridgeProxy = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== "string" || PROBE_PROPS.has(prop)) {
      return undefined;
    }
    const bridge: Record<string, unknown> | undefined = window.hypershell;
    if (!bridge) {
      return bridgelessStub(prop);
    }
    const method = bridge[prop];
    if (typeof method !== "function") {
      throw new Error(
        `window.hypershell.${prop} is not bridged — the preload and global.d.ts have drifted`
      );
    }
    return method;
  },
}) as unknown as ShellApi;

export function getShell(): ShellApi {
  return override ?? bridgeProxy;
}
