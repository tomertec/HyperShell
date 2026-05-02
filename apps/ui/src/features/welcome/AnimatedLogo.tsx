import { motion } from "framer-motion";
import { useEffect, useState, useMemo } from "react";
import "./animated-logo.css";

interface AnimatedLogoProps {
  compact?: boolean;
  onClick?: () => void;
}

// Pick 2-3 random indices to apply glitch effect to
function pickGlitchIndices(length: number): Set<number> {
  const indices = new Set<number>();
  if (length < 3) return indices;
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * length));
  }
  return indices;
}

const GLITCH_CLASSES = ["logo-glitch-1", "logo-glitch-2", "logo-glitch-3"];

export function AnimatedLogo({ compact, onClick }: AnimatedLogoProps) {
  const [phase, setPhase] = useState<"typing" | "idle">("typing");
  const [visibleChars, setVisibleChars] = useState(0);
  const text = "HyperShell";
  const prompt = ">_";

  // Stable glitch indices per mount
  const glitchIndices = useMemo(() => pickGlitchIndices(text.length), []);

  // Typing effect: text first, then prompt suffix
  useEffect(() => {
    const fullLength = text.length + prompt.length;
    if (visibleChars >= fullLength) {
      const timeout = setTimeout(() => setPhase("idle"), 300);
      return () => clearTimeout(timeout);
    }
    const delay = visibleChars < text.length ? 60 + Math.random() * 40 : 80;
    const timeout = setTimeout(() => setVisibleChars((c) => c + 1), delay);
    return () => clearTimeout(timeout);
  }, [visibleChars]);

  const displayedText = text.slice(0, Math.min(visibleChars, text.length));
  const displayedPrompt = prompt.slice(
    0,
    Math.max(0, visibleChars - text.length)
  );

  // Render text characters individually for glitch effect in idle mode
  const renderText = () => {
    if (phase !== "idle") {
      return (
        <span
          className="font-semibold text-text-primary tracking-tight"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {displayedText}
        </span>
      );
    }

    // In idle mode: shimmer overlay + individual glitch chars
    return (
      <span
        className="font-semibold text-text-primary tracking-tight logo-shimmer-track"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {displayedText.split("").map((char, i) => {
          const glitchIdx = [...glitchIndices].indexOf(i);
          if (glitchIdx !== -1) {
            return (
              <span key={i} className={GLITCH_CLASSES[glitchIdx]}>
                {char}
              </span>
            );
          }
          return char;
        })}
        <span className="logo-shimmer-highlight" aria-hidden="true" />
      </span>
    );
  };

  return (
    <motion.button
      layout
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 cursor-pointer select-none focus:outline-none"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Animated glow effect */}
      <div
        className={`absolute -inset-8 rounded-full blur-2xl transition-opacity duration-1000 ${
          phase === "idle"
            ? "logo-glow-pulse bg-accent/[0.06]"
            : "opacity-0"
        }`}
      />

      {/* CRT scanline overlay — large bleed area, no visible edges */}
      {phase === "idle" && (
        <div className="absolute -inset-12 overflow-hidden pointer-events-none">
          <div
            className="logo-scanline absolute left-[10%] right-[10%] h-[1px] blur-[1px] bg-gradient-to-r from-transparent via-accent/[0.06] to-transparent"
          />
        </div>
      )}

      <motion.div
        layout
        className="relative flex items-baseline gap-0"
        style={{ fontSize: compact ? "1.5rem" : "2.5rem" }}
      >
        {/* Text with shimmer + glitch */}
        {renderText()}

        {/* Prompt suffix with breathing animation */}
        <span
          className={`font-light ${phase === "idle" ? "logo-prompt-breathe" : ""}`}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--color-accent)",
            opacity: phase === "idle" ? undefined : 0.7,
          }}
        >
          {displayedPrompt}
        </span>

        {/* Blinking cursor */}
        <motion.span
          className="inline-block w-[2px] bg-accent ml-0.5 rounded-full"
          style={{
            height: compact ? "1.2rem" : "2rem",
            verticalAlign: "baseline",
          }}
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear", times: [0, 0.5, 0.5, 1] }}
        />
      </motion.div>

      {/* Glowing underline scan */}
      {phase === "idle" && (
        <div
          className="logo-underline-track absolute left-0 right-0"
          style={{ bottom: compact ? "2rem" : "2.2rem" }}
        >
          <div
            className="logo-underline h-[1px] w-1/2"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
              opacity: 0.4,
            }}
          />
        </div>
      )}

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
