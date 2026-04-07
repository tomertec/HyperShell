import { useEffect, useRef, useState } from "react";

export interface SessionStats {
  connectionTime: number | null; // seconds since connected
  latency: number | null;
  uptime: string | null;
  cpuUsage: string | null;
  memUsage: string | null;
  diskUsage: string | null;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function useSessionStats(
  sessionId: string | null,
  sessionState: string | null
): SessionStats {
  const connectedAtRef = useRef<number | null>(null);
  const [connectionTime, setConnectionTime] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    cpuUsage: string | null;
    memUsage: string | null;
    diskUsage: string | null;
    uptime: string | null;
    latency: number | null;
  }>({
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    uptime: null,
    latency: null,
  });

  // Track when session becomes connected, reset on session change
  useEffect(() => {
    if (sessionState === "connected") {
      if (connectedAtRef.current === null) {
        connectedAtRef.current = Date.now();
        setConnectionTime(0);
      }
    } else {
      connectedAtRef.current = null;
      setConnectionTime(null);
      setStats({
        cpuUsage: null,
        memUsage: null,
        diskUsage: null,
        uptime: null,
        latency: null,
      });
    }
  }, [sessionState, sessionId]);

  // Update connection time every second
  useEffect(() => {
    if (sessionState !== "connected") return;

    const interval = setInterval(() => {
      if (connectedAtRef.current !== null) {
        const elapsed = Math.floor((Date.now() - connectedAtRef.current) / 1000);
        setConnectionTime(elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionState, sessionId]);

  // Poll for host stats every 15 seconds
  useEffect(() => {
    if (sessionState !== "connected" || !sessionId) return;

    let cancelled = false;

    const fetchStats = async () => {
      try {
        const result = await window.sshterm?.getHostStats?.({ sessionId });
        if (result && !cancelled) {
          setStats((prev) => ({
            ...prev,
            cpuUsage: result.cpuLoad,
            memUsage: result.memUsage,
            diskUsage: result.diskUsage,
            uptime: result.uptime,
            latency: result.latencyMs,
          }));
        }
      } catch {
        // Stats polling failure is non-fatal
      }
    };

    // Initial fetch after 2 seconds (let session stabilize)
    const initialTimeout = setTimeout(fetchStats, 2000);
    // Then poll every 15 seconds
    const interval = setInterval(fetchStats, 15000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [sessionId, sessionState]);

  return {
    connectionTime,
    latency: stats.latency,
    uptime: stats.uptime,
    cpuUsage: stats.cpuUsage,
    memUsage: stats.memUsage,
    diskUsage: stats.diskUsage,
  };
}
