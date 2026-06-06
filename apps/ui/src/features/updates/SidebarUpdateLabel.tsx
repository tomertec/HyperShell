import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { UpdateState } from "@hypershell/shared";

import { useUpdateStore } from "./updateStore";

export type UpdateMode =
  | { kind: "version" }
  | { kind: "available"; label: string; action: "download" }
  | { kind: "manual"; label: string; action: "openRelease" }
  | { kind: "downloading"; label: string; percent: number }
  | { kind: "downloaded"; label: string; action: "install" };

/**
 * Pure mapping from update state to what the footer label should show.
 * Labels keep the logo's `>_` prompt motif so the morph stays on-brand.
 * Non-actionable states (idle/checking/up-to-date/error/null) fall back to the
 * plain version label.
 */
export function resolveUpdateMode(update: UpdateState | null): UpdateMode {
  switch (update?.status) {
    case "available":
      return { kind: "available", label: `Update>_ v${update.availableVersion ?? ""}`, action: "download" };
    case "manual-available":
      return { kind: "manual", label: `Update>_ v${update.availableVersion ?? ""}`, action: "openRelease" };
    case "downloading":
      return {
        kind: "downloading",
        label: `Downloading>_ ${update.progressPercent ?? 0}%`,
        percent: update.progressPercent ?? 0,
      };
    case "downloaded":
      return { kind: "downloaded", label: "Restart>_ ready", action: "install" };
    default:
      return { kind: "version" };
  }
}

const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#abcdef0123456789";

/**
 * Terminal-style "decode" effect: animates the displayed string from its
 * previous value to `target`, cycling random glyphs per character until each
 * locks in. Pass `instant` to snap without animating (e.g. live progress %).
 */
function useScramble(target: string, instant: boolean): string {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;

    if (instant || from === target) {
      setDisplay(target);
      return;
    }

    const length = Math.max(from.length, target.length);
    const queue = Array.from({ length }, (_, i) => {
      const start = Math.floor(Math.random() * 18);
      return {
        from: from[i] ?? "",
        to: target[i] ?? "",
        start,
        end: start + 10 + Math.floor(Math.random() * 18),
        char: "",
      };
    });

    let frame = 0;
    const tick = () => {
      let output = "";
      let done = 0;
      for (const item of queue) {
        if (frame >= item.end) {
          done++;
          output += item.to;
        } else if (frame >= item.start) {
          if (!item.char || Math.random() < 0.28) {
            item.char = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          }
          output += item.char;
        } else {
          output += item.from;
        }
      }
      setDisplay(output);
      if (done < queue.length) {
        frame++;
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    tick();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, instant]);

  return display;
}

/** Render a label keeping the logo's `>_` prompt accented. */
function renderPrompt(text: string, actionable: boolean): ReactNode {
  const i = text.indexOf(">_");
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className={actionable ? "text-accent" : "text-accent/50"}>&gt;_</span>
      {text.slice(i + 2)}
    </>
  );
}

export function SidebarUpdateLabel({ version }: { version: string }) {
  const update = useUpdateStore((s) => s.update);
  const download = useUpdateStore((s) => s.download);
  const install = useUpdateStore((s) => s.install);
  const openRelease = useUpdateStore((s) => s.openRelease);

  const mode = resolveUpdateMode(update);
  const versionLabel = `HyperShell>_ v${version}`;
  const label = mode.kind === "version" ? versionLabel : mode.label;

  const actionable = mode.kind !== "version";
  const clickable = mode.kind === "available" || mode.kind === "manual" || mode.kind === "downloaded";
  const display = useScramble(label, mode.kind === "downloading");
  const settled = display === label;

  const activate = () => {
    if (mode.kind === "available") void download();
    else if (mode.kind === "manual") void openRelease();
    else if (mode.kind === "downloaded") void install();
  };

  return (
    <div className="flex min-h-[18px] items-center justify-end">
      <motion.div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? activate : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate();
                }
              }
            : undefined
        }
        title={actionable ? label : undefined}
        aria-label={actionable ? label : undefined}
        animate={actionable ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
        transition={
          actionable
            ? { repeat: Infinity, duration: 2.4, ease: "easeInOut" }
            : { duration: 0.2 }
        }
        className={[
          "relative whitespace-nowrap text-[10px] tracking-wide transition-colors duration-300",
          actionable ? "text-accent" : "select-none text-text-muted/60",
          clickable ? "cursor-pointer hover:text-accent/70" : "",
        ].join(" ")}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {settled ? renderPrompt(label, actionable) : display}
        {mode.kind === "downloading" ? (
          <span
            className="absolute -bottom-0.5 left-0 h-px bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${mode.percent}%` }}
            aria-hidden
          />
        ) : null}
      </motion.div>
    </div>
  );
}
