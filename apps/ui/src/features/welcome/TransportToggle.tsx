import { motion } from "framer-motion";

export type TransportMode = "ssh" | "serial";

interface TransportToggleProps {
  value: TransportMode;
  onChange: (mode: TransportMode) => void;
}

export function TransportToggle({ value, onChange }: TransportToggleProps) {
  return (
    <div className="relative flex items-center bg-base-800 rounded-full p-0.5 border border-border/60">
      {/* Sliding highlight */}
      <motion.div
        layout
        className="absolute top-0.5 bottom-0.5 rounded-full bg-accent/[0.12] border border-accent/20"
        style={{ width: "50%" }}
        animate={{ x: value === "ssh" ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />
      <button
        onClick={() => onChange("ssh")}
        className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors ${
          value === "ssh" ? "text-accent" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        SSH
      </button>
      <button
        onClick={() => onChange("serial")}
        className={`relative z-10 px-5 py-1.5 rounded-full text-xs font-medium tracking-wide transition-colors ${
          value === "serial" ? "text-accent" : "text-text-muted hover:text-text-secondary"
        }`}
      >
        Serial
      </button>
    </div>
  );
}
