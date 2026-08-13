import type { TransferConflictResolution } from "../resolveTransferConflict";

export interface TransferConflictActionsProps {
  transferId: string;
  onResolve: (
    transferId: string,
    resolution: TransferConflictResolution,
    applyToAll: boolean
  ) => void;
}

const SINGLE_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite", resolution: "overwrite" },
  { label: "Skip", resolution: "skip" },
  { label: "Rename", resolution: "rename" }
];

const ALL_ACTIONS: Array<{ label: string; resolution: TransferConflictResolution }> = [
  { label: "Overwrite all", resolution: "overwrite" },
  { label: "Skip all", resolution: "skip" }
];

/**
 * Conflict resolution row shared by both transfer monitors. The popup and the
 * inline panel must offer identical choices — a conflict raised while one is
 * hidden has to stay resolvable in the other.
 */
export function TransferConflictActions({ transferId, onResolve }: TransferConflictActionsProps) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-amber-200/70">File exists:</span>

      {SINGLE_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100"
          onClick={() => onResolve(transferId, resolution, false)}
        >
          {label}
        </button>
      ))}

      <span className="mx-0.5 text-[9px] text-text-secondary/50">|</span>

      {ALL_ACTIONS.map(({ label, resolution }) => (
        <button
          key={label}
          type="button"
          className="rounded border border-amber-400/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-200/70 transition-colors hover:border-amber-400/30 hover:text-amber-100"
          onClick={() => onResolve(transferId, resolution, true)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
