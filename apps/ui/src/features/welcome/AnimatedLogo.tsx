import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface AnimatedLogoProps {
  compact?: boolean;
  onClick?: () => void;
}

export function AnimatedLogo({ compact, onClick }: AnimatedLogoProps) {
  const [phase, setPhase] = useState<"typing" | "idle">("typing");
  const [visibleChars, setVisibleChars] = useState(0);
  const text = "SSHTerm";
  const prompt = ">_ ";

  // Typing effect
  useEffect(() => {
    const fullLength = prompt.length + text.length;
    if (visibleChars >= fullLength) {
      const timeout = setTimeout(() => setPhase("idle"), 300);
      return () => clearTimeout(timeout);
    }
    const delay = visibleChars < prompt.length ? 80 : 60 + Math.random() * 40;
    const timeout = setTimeout(() => setVisibleChars((c) => c + 1), delay);
    return () => clearTimeout(timeout);
  }, [visibleChars]);

  const displayedPrompt = prompt.slice(0, Math.min(visibleChars, prompt.length));
  const displayedText = text.slice(
    0,
    Math.max(0, visibleChars - prompt.length)
  );

  return (
    <motion.button
      layout
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 cursor-pointer select-none focus:outline-none"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Glow effect */}
      <div
        className={`absolute -inset-8 rounded-full blur-2xl transition-opacity duration-1000 ${
          phase === "idle"
            ? "opacity-100 bg-accent/[0.06]"
            : "opacity-0"
        }`}
      />
      <motion.div
        layout
        className="relative flex items-baseline gap-0"
        style={{ fontSize: compact ? "1.5rem" : "2.5rem" }}
      >
        <span className="font-mono text-accent/70 font-light">{displayedPrompt}</span>
        <span className="font-mono font-semibold text-text-primary tracking-tight">
          {displayedText}
        </span>
        {/* Blinking cursor */}
        <motion.span
          className="inline-block w-[2px] bg-accent ml-0.5 rounded-full"
          style={{
            height: compact ? "1.2rem" : "2rem",
            verticalAlign: "baseline",
          }}
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: "steps(1)" }}
        />
      </motion.div>

      {/* Subtitle - only when not compact */}
      {!compact && phase === "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-xs text-text-muted"
        >
          Click to connect
        </motion.div>
      )}
    </motion.button>
  );
}
