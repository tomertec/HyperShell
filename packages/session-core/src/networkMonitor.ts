import dns from "node:dns/promises";

export interface NetworkMonitor {
  isOnline(): boolean;
  onOnline(cb: () => void): () => void;
  onOffline(cb: () => void): () => void;
  dispose(): void;
  /** @internal test helper */
  _setOnline(online: boolean): void;
}

export interface NetworkMonitorOptions {
  /** Hostname to probe for connectivity checks. Default: "dns.google" */
  probeHostname?: string;
  /** Probe interval in ms. Default: 10000 (10s). Set 0 to disable probing. */
  probeIntervalMs?: number;
}

export function createNetworkMonitor(
  options: NetworkMonitorOptions = {}
): NetworkMonitor {
  const { probeHostname = "dns.google", probeIntervalMs = 10000 } = options;

  let online = true;
  const onlineListeners = new Set<() => void>();
  const offlineListeners = new Set<() => void>();
  let probeTimer: ReturnType<typeof setInterval> | null = null;
  let latestProbeId = 0;

  function setOnline(value: boolean): void {
    if (value === online) return;
    online = value;
    const listeners = value ? onlineListeners : offlineListeners;
    for (const cb of listeners) {
      cb();
    }
  }

  async function probe(): Promise<void> {
    const probeId = ++latestProbeId;
    try {
      await dns.resolve(probeHostname);
      if (probeId !== latestProbeId) return;
      setOnline(true);
    } catch {
      if (probeId !== latestProbeId) return;
      setOnline(false);
    }
  }

  if (probeIntervalMs > 0) {
    void probe(); // Immediate probe to avoid optimistic online assumption burning reconnect attempts
    probeTimer = setInterval(probe, probeIntervalMs);
  }

  return {
    isOnline() {
      return online;
    },

    onOnline(cb) {
      onlineListeners.add(cb);
      return () => { onlineListeners.delete(cb); };
    },

    onOffline(cb) {
      offlineListeners.add(cb);
      return () => { offlineListeners.delete(cb); };
    },

    dispose() {
      latestProbeId += 1;
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = null;
      }
      onlineListeners.clear();
      offlineListeners.clear();
    },

    _setOnline(value: boolean) {
      setOnline(value);
    },
  };
}
