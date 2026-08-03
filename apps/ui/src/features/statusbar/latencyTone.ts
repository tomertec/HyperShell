export type LatencyTone = "normal" | "warning" | "danger";

export function latencyTone(ms: number): LatencyTone {
  if (ms > 400) return "danger";
  if (ms > 150) return "warning";
  return "normal";
}
