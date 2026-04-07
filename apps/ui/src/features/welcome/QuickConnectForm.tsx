import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { TransportToggle, type TransportMode } from "./TransportToggle";

interface QuickConnectFormProps {
  availablePorts: string[];
  onRefreshPorts: () => void;
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onConnectSerial: (port: string, baudRate: number, options?: SerialAdvancedOptions) => void;
  onCancel: () => void;
}

export interface SerialAdvancedOptions {
  dataBits: number;
  stopBits: number;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "rtscts" | "xonxoff";
}

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const inputClass =
  "w-full bg-base-750 border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-border/60 focus:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.85)] transition-colors";

const selectClass =
  "w-full bg-base-750 border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-border/60 focus:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.85)] transition-colors appearance-none";

export function QuickConnectForm({
  availablePorts,
  onRefreshPorts,
  onConnectSsh,
  onConnectSerial,
  onCancel,
}: QuickConnectFormProps) {
  const [mode, setMode] = useState<TransportMode>("ssh");

  // SSH fields
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Serial fields
  const [comPort, setComPort] = useState("");
  const [baudRate, setBaudRate] = useState("9600");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataBits, setDataBits] = useState("8");
  const [stopBits, setStopBits] = useState("1");
  const [parity, setParity] = useState<"none" | "even" | "odd">("none");
  const [flowControl, setFlowControl] = useState<"none" | "rtscts" | "xonxoff">("none");

  useEffect(() => {
    if (mode === "serial") onRefreshPorts();
  }, [mode, onRefreshPorts]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === "ssh") {
        if (!host.trim()) return;
        onConnectSsh(host.trim(), parseInt(port) || 22, username, password);
      } else {
        if (!comPort) return;
        const advanced: SerialAdvancedOptions | undefined = showAdvanced
          ? {
              dataBits: parseInt(dataBits),
              stopBits: parseInt(stopBits),
              parity,
              flowControl,
            }
          : undefined;
        onConnectSerial(comPort, parseInt(baudRate) || 9600, advanced);
      }
    },
    [mode, host, port, username, password, comPort, baudRate, showAdvanced, dataBits, stopBits, parity, flowControl, onConnectSsh, onConnectSerial]
  );

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col items-center gap-5"
    >
      <TransportToggle value={mode} onChange={setMode} />

      <AnimatePresence mode="wait">
        {mode === "ssh" ? (
          <motion.div
            key="ssh"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.15 }}
            className="w-full flex flex-col gap-3"
          >
            <input
              type="text"
              placeholder="Hostname or IP address"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputClass}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className={`${inputClass} w-24 shrink-0`}
              />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </div>
            <input
              type="password"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </motion.div>
        ) : (
          <motion.div
            key="serial"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15 }}
            className="w-full flex flex-col gap-3"
          >
            <div className="flex gap-2">
              <select
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
                className={`${selectClass} flex-1`}
              >
                <option value="" disabled>
                  {availablePorts.length ? "Select COM port" : "No ports found"}
                </option>
                {availablePorts.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={onRefreshPorts}
                className="px-2.5 py-2 rounded-lg border border-border/60 bg-base-750 text-text-muted hover:text-text-primary hover:border-border-bright transition-colors"
                title="Refresh ports"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11.5 7A4.5 4.5 0 1 1 7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(e.target.value)}
              className={selectClass}
            >
              {BAUD_RATES.map((r) => (
                <option key={r} value={r}>{r} baud</option>
              ))}
            </select>

            {/* More options toggle */}
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
                <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              More options
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
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Data bits</label>
                        <select value={dataBits} onChange={(e) => setDataBits(e.target.value)} className={selectClass}>
                          {[5, 6, 7, 8].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Stop bits</label>
                        <select value={stopBits} onChange={(e) => setStopBits(e.target.value)} className={selectClass}>
                          {[1, 2].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Parity</label>
                        <select value={parity} onChange={(e) => setParity(e.target.value as typeof parity)} className={selectClass}>
                          <option value="none">None</option>
                          <option value="even">Even</option>
                          <option value="odd">Odd</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-text-muted mb-1 block">Flow control</label>
                        <select value={flowControl} onChange={(e) => setFlowControl(e.target.value as typeof flowControl)} className={selectClass}>
                          <option value="none">None</option>
                          <option value="rtscts">RTS/CTS</option>
                          <option value="xonxoff">XON/XOFF</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-center gap-3 w-full">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border border-border/40 hover:border-border-bright transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-accent/[0.12] text-accent border border-accent/20 hover:bg-accent/[0.18] hover:border-accent/30 transition-colors"
        >
          Connect
        </button>
      </div>
    </motion.form>
  );
}
