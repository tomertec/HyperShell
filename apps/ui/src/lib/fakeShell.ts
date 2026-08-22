import type { ShellApi } from "./shell";

export interface FakeShell {
  shell: ShellApi;
  /** Every invocation in order, including calls to overridden methods. */
  calls: { method: string; args: unknown[] }[];
}

/**
 * In-memory second adapter for the shell seam. Methods not listed in
 * `overrides` resolve `undefined` (or return a no-op unsubscribe for `on*`
 * listeners) and record their invocation, so a test stubs only what it needs.
 * An override explicitly set to `undefined` simulates preload drift: accessing
 * that method throws, matching the prod adapter's contract.
 */
export function createFakeShell(overrides: Partial<ShellApi> = {}): FakeShell {
  const calls: FakeShell["calls"] = [];
  const table = overrides as Record<string, (...args: unknown[]) => unknown>;
  const shell = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then" || prop === "$$typeof") {
        return undefined;
      }
      if (prop in table && typeof table[prop] !== "function") {
        throw new Error(`fake shell: ${prop} is stubbed as missing (preload drift)`);
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        const impl = table[prop];
        if (typeof impl === "function") {
          return impl(...args);
        }
        return prop.startsWith("on") ? () => {} : Promise.resolve(undefined);
      };
    },
  }) as unknown as ShellApi;
  return { shell, calls };
}
