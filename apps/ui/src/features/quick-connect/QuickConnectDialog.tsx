import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { searchProfiles, type QuickConnectProfile } from "./searchIndex";

export interface QuickConnectDialogProps {
  open: boolean;
  onClose: () => void;
  profiles?: QuickConnectProfile[];
  onOpenProfile?: (profile: QuickConnectProfile) => void;
}

const defaultProfiles: QuickConnectProfile[] = [
  {
    id: "host-1",
    label: "web-01",
    hostname: "web-01.example.com",
    transport: "ssh",
    group: "Production",
    tags: ["web", "linux"]
  },
  {
    id: "serial-1",
    label: "Console / COM3",
    hostname: "COM3",
    transport: "serial",
    group: "Lab",
    tags: ["serial"]
  }
];

export function QuickConnectDialog({
  open,
  onClose,
  profiles = defaultProfiles,
  onOpenProfile
}: QuickConnectDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchProfiles(profiles, query), [profiles, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (profile: QuickConnectProfile) => {
      onOpenProfile?.(profile);
      onClose();
    },
    [onOpenProfile, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(results.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + results.length) % Math.max(results.length, 1));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    },
    [results, selectedIndex, handleSelect]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            role="dialog"
            aria-label="Quick Connect"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full max-w-md mx-4 rounded-xl border border-border-bright/60 bg-base-800 shadow-2xl shadow-black/50 overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent/50 shrink-0">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search hosts, tags, groups..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/70 placeholder:text-xs focus:outline-none"
              />
              <kbd className="text-[10px] text-text-muted bg-base-700/80 px-1.5 py-0.5 rounded border border-border/50">ESC</kbd>
            </div>

            <div ref={listRef} className="max-h-64 overflow-y-auto p-1.5">
              {results.map((profile, index) => (
                <button
                  key={profile.id}
                  data-index={index}
                  onClick={() => handleSelect(profile)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-100 ${
                    index === selectedIndex
                      ? "bg-accent/[0.08] text-text-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    {/* Accent bar for selected */}
                    <span
                      className={`w-0.5 h-5 rounded-full transition-colors duration-100 ${
                        index === selectedIndex ? "bg-accent/60" : "bg-transparent"
                      }`}
                    />
                    <div>
                      <div className="text-text-primary truncate font-medium">{profile.label}</div>
                      <div className="text-[11px] text-text-muted truncate">
                        {profile.hostname ?? "No host"} {profile.group ? `\u00b7 ${profile.group}` : ""}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted bg-base-700/60 px-1.5 py-0.5 rounded ml-2 shrink-0 border border-border/30">
                    {profile.transport}
                  </span>
                </button>
              ))}
              {results.length === 0 && (
                <div className="px-3 py-6 text-xs text-text-muted text-center">No matches found.</div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/60">
              <span><kbd className="font-medium text-text-muted/80">&uarr;&darr;</kbd> navigate</span>
              <span><kbd className="font-medium text-text-muted/80">Enter</kbd> connect</span>
              <span><kbd className="font-medium text-text-muted/80">Esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
