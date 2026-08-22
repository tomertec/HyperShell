/**
 * Init-script bridge stub for browser E2E.
 *
 * The shell seam (apps/ui/src/lib/shell.ts) treats a present-but-incomplete
 * bridge as preload drift, and the app trusts a present bridge to return
 * shape-correct results. A spec that injects `window.hypershell` therefore
 * has to model a complete, truthful-but-empty backend — not a two-method
 * stub — or App boot crashes on `undefined.map(...)`.
 *
 * Pass this function to `page.addInitScript(installFakeBridge, options)`.
 * It is serialized into the page, so it must stay self-contained.
 */
export interface FakeBridgeOptions {
  /** Local profiles returned by listLocalProfiles/rescanLocalProfiles. */
  profiles: unknown[];
  /** When set, getSetting/updateSetting persist app settings in localStorage under this key. */
  settingsKey?: string;
}

export function installFakeBridge(options: FakeBridgeOptions): void {
  const empty = () => Promise.resolve([]);
  let sessionCounter = 0;
  const stub: Record<string, unknown> = {
    listLocalProfiles: () => Promise.resolve(options.profiles),
    rescanLocalProfiles: () => Promise.resolve(options.profiles),
    listHosts: empty,
    listSerialProfiles: empty,
    listTags: empty,
    connectionHistoryListRecent: empty,
    sessionLoadSavedState: empty,
    workspaceLoadLast: () => Promise.resolve(null),
    openSession: () => Promise.resolve({ sessionId: `e2e-session-${++sessionCounter}` }),
    getSetting: ({ key }: { key: string }) => {
      const value = options.settingsKey ? localStorage.getItem(options.settingsKey) : null;
      return Promise.resolve(key === "app.settings" && value ? { key, value } : null);
    },
    updateSetting: ({ key, value }: { key: string; value: string }) => {
      if (options.settingsKey) {
        localStorage.setItem(options.settingsKey, value);
      }
      return Promise.resolve({ key, value });
    },
  };
  (window as unknown as { hypershell: unknown }).hypershell = new Proxy(stub, {
    get: (target, prop) =>
      prop in target
        ? target[prop as string]
        : typeof prop === "string" && prop.startsWith("on")
          ? () => () => {}
          : () => Promise.resolve(undefined),
  });
}
