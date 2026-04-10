import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TelnetQuickConnectProps {
  open: boolean;
  onClose: () => void;
  onConnect: (opts: {
    hostname: string;
    port: number;
    mode: "telnet" | "raw";
    terminalType?: string;
  }) => void;
}

const inputClass =
  "w-full bg-base-750 border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-border/60 focus:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.85)] transition-colors";

export function TelnetQuickConnect({
  open,
  onClose,
  onConnect,
}: TelnetQuickConnectProps) {
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState("23");
  const [mode, setMode] = useState<"telnet" | "raw">("telnet");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [terminalType, setTerminalType] = useState("xterm-256color");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!hostname.trim()) return;
      onConnect({
        hostname: hostname.trim(),
        port: parseInt(port, 10) || 23,
        mode,
        terminalType: terminalType || undefined,
      });
      setHostname("");
      setPort("23");
      setMode("telnet");
    },
    [hostname, port, mode, terminalType, onConnect],
  );

  const handleModeChange = useCallback(
    (newMode: "telnet" | "raw") => {
      setMode(newMode);
      if (newMode === "telnet") {
        setPort("23");
      }
    },
    [],
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
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="bg-base-800 border border-border rounded-xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-text-primary mb-4">
              Quick Connect
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {/* Host */}
              <input
                type="text"
                placeholder="192.168.1.1 or hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className={inputClass}
                autoFocus
              />

              {/* Port */}
              <input
                type="number"
                placeholder="Port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                min={1}
                max={65535}
                className={inputClass}
              />

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange("telnet")}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    mode === "telnet"
                      ? "bg-accent text-white"
                      : "bg-base-700 text-text-muted hover:text-text-primary"
                  }`}
                >
                  Telnet
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("raw")}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    mode === "raw"
                      ? "bg-accent text-white"
                      : "bg-base-700 text-text-muted hover:text-text-primary"
                  }`}
                >
                  Raw TCP
                </button>
              </div>

              {/* Advanced section */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors self-start"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                >
                  <path
                    d="M3 1.5L7 5L3 8.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Advanced
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 pt-1">
                      <label className="text-[10px] text-text-muted block">
                        Terminal Type
                      </label>
                      <input
                        type="text"
                        value={terminalType}
                        onChange={(e) => setTerminalType(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div className="flex items-center gap-3 w-full pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm bg-base-700 hover:bg-base-600 text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!hostname.trim()}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-accent hover:bg-accent/90 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
