import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface TmuxSessionInfo {
  name: string;
  windowCount: number;
  createdAt: string; // ISO string
  attached: boolean;
}

interface TmuxSessionPickerProps {
  open: boolean;
  sessions: TmuxSessionInfo[];
  hostName: string;
  onAttach: (sessionName: string) => void;
  onSkip: () => void;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TmuxSessionPicker({
  open,
  sessions,
  hostName,
  onAttach,
  onSkip,
}: TmuxSessionPickerProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    },
    [onSkip],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onSkip}
          onKeyDown={handleKeyDown}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="bg-base-800 border border-border rounded-xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-text-primary mb-1">
              Tmux Sessions
            </h2>
            <p className="text-xs text-text-muted mb-4">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} found
              on {hostName}
            </p>

            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {sessions.map((session) => (
                <button
                  key={session.name}
                  type="button"
                  onClick={() => onAttach(session.name)}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left text-sm transition-colors hover:bg-base-700/60 group"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-text-primary">
                      {session.name}
                    </span>
                    <span className="text-text-muted ml-2 text-xs">
                      {session.windowCount} window
                      {session.windowCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[11px] text-text-muted">
                      {formatRelativeTime(session.createdAt)}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        session.attached
                          ? "bg-warning/15 text-warning"
                          : "bg-success/15 text-success"
                      }`}
                    >
                      {session.attached ? "attached" : "detached"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={onSkip}
                className="w-full py-2 rounded-lg text-sm bg-base-700 hover:bg-base-600 text-text-muted hover:text-text-primary transition-colors"
              >
                New shell
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
