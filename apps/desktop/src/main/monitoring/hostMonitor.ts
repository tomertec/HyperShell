import net from "node:net";

export type HostMonitorTarget = {
  id: string;
  host: string;
  port?: number;
  intervalMs?: number;
};

export type HostMonitorStatus = "idle" | "checking" | "up" | "down";

export type HostMonitorEvent = {
  targetId: string;
  status: HostMonitorStatus;
  checkedAt: number;
  latencyMs?: number;
  error?: string;
};

export interface HostMonitor {
  addTarget(target: HostMonitorTarget): void;
  removeTarget(targetId: string): void;
  start(): void;
  stop(): void;
  onEvent(listener: (event: HostMonitorEvent) => void): () => void;
}

export interface HostMonitorDeps {
  probe?: (target: HostMonitorTarget) => Promise<HostMonitorEvent>;
  now?: () => number;
  setIntervalFn?: (callback: () => void, intervalMs: number) => NodeJS.Timeout;
  clearIntervalFn?: (handle: NodeJS.Timeout) => void;
  tickIntervalMs?: number;
}

async function probeTarget(target: HostMonitorTarget): Promise<HostMonitorEvent> {
  const startedAt = Date.now();
  const port = target.port ?? 22;

  return await new Promise<HostMonitorEvent>((resolve) => {
    const socket = net.createConnection({ host: target.host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve({
        targetId: target.id,
        status: "up",
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt
      });
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve({
        targetId: target.id,
        status: "down",
        checkedAt: Date.now(),
        error: error.message
      });
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve({
        targetId: target.id,
        status: "down",
        checkedAt: Date.now(),
        error: "Timed out"
      });
    });
  });
}

export function createHostMonitor(deps: HostMonitorDeps = {}): HostMonitor {
  const targets = new Map<string, HostMonitorTarget>();
  const listeners = new Set<(event: HostMonitorEvent) => void>();
  const probe = deps.probe ?? probeTarget;
  const now = deps.now ?? (() => Date.now());
  const setIntervalFn =
    deps.setIntervalFn ??
    ((callback: () => void, intervalMs: number) =>
      setInterval(callback, intervalMs));
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  const tickIntervalMs = deps.tickIntervalMs ?? 30_000;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let generation = 0;
  let tickInFlight = false;
  let tickQueued = false;

  const emit = (event: HostMonitorEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const tick = async (runGeneration: number): Promise<void> => {
    if (!running || runGeneration !== generation) {
      return;
    }

    if (tickInFlight) {
      tickQueued = true;
      return;
    }

    tickInFlight = true;

    for (const target of targets.values()) {
      if (!running || runGeneration !== generation) {
        break;
      }

      emit({
        targetId: target.id,
        status: "checking",
        checkedAt: now()
      });

      const result = await probe(target);
      if (!running || runGeneration !== generation) {
        break;
      }

      emit(result);
    }

    tickInFlight = false;

    if (tickQueued && running && runGeneration === generation) {
      tickQueued = false;
      void tick(runGeneration);
    }
  };

  return {
    addTarget(target) {
      targets.set(target.id, target);
    },
    removeTarget(targetId) {
      targets.delete(targetId);
    },
    start() {
      if (running) {
        return;
      }

      running = true;
      generation += 1;
      const runGeneration = generation;

      void tick(runGeneration);
      timer = setIntervalFn(() => {
        void tick(runGeneration);
      }, tickIntervalMs);
    },
    stop() {
      if (!running) {
        return;
      }

      running = false;
      generation += 1;
      tickQueued = false;

      if (!timer) {
        return;
      }

      clearIntervalFn(timer);
      timer = null;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
