import { useTunnelStore } from "./tunnelStore";

export function TunnelTopology() {
  const { activeForwards } = useTunnelStore();

  if (activeForwards.length === 0) {
    return null;
  }

  // Collect unique remote hosts
  const remoteHosts = new Map<string, { host: string; forwards: typeof activeForwards }>();
  for (const fwd of activeForwards) {
    const host = fwd.remoteHost || fwd.hostname || "remote";
    if (!remoteHosts.has(host)) {
      remoteHosts.set(host, { host, forwards: [] });
    }
    remoteHosts.get(host)!.forwards.push(fwd);
  }

  const hosts = [...remoteHosts.values()];
  const svgHeight = Math.max(120, hosts.length * 50 + 40);

  return (
    <div className="p-3 border-b border-border/30">
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 400 ${svgHeight}`}
        className="text-text-primary"
      >
        {/* Localhost node */}
        <rect x="10" y={svgHeight / 2 - 16} width="80" height="32" rx="6" fill="var(--color-surface, #1a1a2e)" stroke="var(--color-accent, #6366f1)" strokeWidth="1.5" />
        <text x="50" y={svgHeight / 2 + 4} textAnchor="middle" fill="currentColor" fontSize="11" fontFamily="monospace">localhost</text>

        {/* Remote host nodes + edges */}
        {hosts.map((entry, i) => {
          const y = 30 + i * 50;
          const fwdCount = entry.forwards.length;
          const isActive = entry.forwards.some((f) => f.status === "active");
          const edgeColor = isActive ? "var(--color-success, #22c55e)" : "var(--color-text-muted, #6b7280)";

          return (
            <g key={entry.host}>
              {/* Edge */}
              <line x1="90" y1={svgHeight / 2} x2="240" y2={y + 16} stroke={edgeColor} strokeWidth="1.5" strokeDasharray={isActive ? "" : "4 3"} />
              {/* Port label */}
              <text x="165" y={y + 10} textAnchor="middle" fill="var(--color-text-muted, #9ca3af)" fontSize="9" fontFamily="monospace">
                {fwdCount} fwd{fwdCount !== 1 ? "s" : ""}
              </text>
              {/* Remote node */}
              <rect x="240" y={y} width="140" height="32" rx="6" fill="var(--color-surface, #1a1a2e)" stroke={edgeColor} strokeWidth="1.5" />
              <text x="310" y={y + 20} textAnchor="middle" fill="currentColor" fontSize="11" fontFamily="monospace" className="truncate">
                {entry.host.length > 18 ? entry.host.slice(0, 15) + "..." : entry.host}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
