import net from "node:net";

export const HOST_STATUS_POLL_INTERVAL_MS = 60_000;
const HOST_STATUS_PROBE_TIMEOUT_MS = 3_000;

export type HostStatusTarget = {
  hostId: string;
  hostname: string;
  port: number;
};

export type HostStatusProbeResult = {
  online: boolean;
  latencyMs: number | null;
};

export type HostStatusEvent = {
  hostId: string;
  online: boolean;
  latencyMs: number | null;
  checkedAt: string;
};

export interface HostStatusService {
  setTargets(targets: HostStatusTarget[]): void;
  start(): void;
  stop(): void;
  onStatus(listener: (event: HostStatusEvent) => void): () => void;
}

export interface HostStatusServiceDeps {
  probe?: (target: HostStatusTarget) => Promise<HostStatusProbeResult>;
  now?: () => number;
  setIntervalFn?: (
    callback: () => void,
    intervalMs: number
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  intervalMs?: number;
}

async function probeTarget(target: HostStatusTarget): Promise<HostStatusProbeResult> {
  const startedAt = Date.now();

  return await new Promise<HostStatusProbeResult>((resolve) => {
    const socket = net.createConnection({
      host: target.hostname,
      port: target.port,
    });
    let completed = false;

    const finish = (result: HostStatusProbeResult): void => {
      if (completed) {
        return;
      }
      completed = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => {
      finish({
        online: true,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
    });

    socket.once("error", () => {
      finish({
        online: false,
        latencyMs: null,
      });
    });

    socket.setTimeout(HOST_STATUS_PROBE_TIMEOUT_MS, () => {
      finish({
        online: false,
        latencyMs: null,
      });
    });
  });
}

export function createHostStatusService(
  deps: HostStatusServiceDeps = {}
): HostStatusService {
  const listeners = new Set<(event: HostStatusEvent) => void>();
  const targets = new Map<string, HostStatusTarget>();
  const probe = deps.probe ?? probeTarget;
  const now = deps.now ?? (() => Date.now());
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  const intervalMs = deps.intervalMs ?? HOST_STATUS_POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let generation = 0;
  let tickInFlight = false;
  let tickQueued = false;

  const emit = (event: HostStatusEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const runTick = async (runGeneration: number): Promise<void> => {
    if (!running || runGeneration !== generation) {
      return;
    }

    if (tickInFlight) {
      tickQueued = true;
      return;
    }

    tickInFlight = true;

    const currentTargets = Array.from(targets.values());
    const results = await Promise.allSettled(
      currentTargets.map((target) => probe(target))
    );

    for (let i = 0; i < currentTargets.length; i++) {
      if (!running || runGeneration !== generation) {
        break;
      }

      const settled = results[i];
      const result =
        settled.status === "fulfilled"
          ? settled.value
          : { online: false, latencyMs: null };

      emit({
        hostId: currentTargets[i].hostId,
        online: result.online,
        latencyMs: result.latencyMs,
        checkedAt: new Date(now()).toISOString(),
      });
    }

    tickInFlight = false;

    if (tickQueued && running && runGeneration === generation) {
      tickQueued = false;
      void runTick(runGeneration);
    }
  };

  return {
    setTargets(nextTargets) {
      targets.clear();

      for (const target of nextTargets) {
        if (!target.hostId || !target.hostname) {
          continue;
        }
        if (
          !Number.isInteger(target.port) ||
          target.port < 1 ||
          target.port > 65535
        ) {
          continue;
        }
        targets.set(target.hostId, target);
      }

      if (running) {
        void runTick(generation);
      }
    },
    start() {
      if (running) {
        return;
      }

      running = true;
      generation += 1;
      const runGeneration = generation;
      void runTick(runGeneration);
      timer = setIntervalFn(() => {
        void runTick(runGeneration);
      }, intervalMs);
    },
    stop() {
      if (!running) {
        return;
      }

      running = false;
      generation += 1;
      tickQueued = false;

      if (timer) {
        clearIntervalFn(timer);
        timer = null;
      }
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
