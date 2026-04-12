import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useCommandPaletteStore } from "./commandPaletteStore";
import { searchCommands, type Command } from "./searchCommands";

interface CommandPaletteProps {
  commands: Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const recentIds = useCommandPaletteStore((s) => s.recentIds);
  const recordExecution = useCommandPaletteStore((s) => s.recordExecution);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build display list: if no query, show recents then grouped; if query, flat search results
  const displayItems = useMemo(() => {
    const filtered = searchCommands(commands, query);
    if (query.trim()) return { items: filtered, sections: null };

    // Group by category, with recents first
    const recentCommands = recentIds
      .map((id) => filtered.find((c) => c.id === id))
      .filter((c): c is Command => c !== undefined);

    const recentIdSet = new Set(recentIds);
    const rest = filtered.filter((c) => !recentIdSet.has(c.id));

    const grouped = new Map<string, Command[]>();
    for (const cmd of rest) {
      const list = grouped.get(cmd.category) ?? [];
      list.push(cmd);
      grouped.set(cmd.category, list);
    }

    const sections: Array<{ label: string; commands: Command[] }> = [];
    if (recentCommands.length > 0) {
      sections.push({ label: "Recent", commands: recentCommands });
    }
    for (const [category, cmds] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({ label: category, commands: cmds });
    }

    const allItems = sections.flatMap((s) => s.commands);
    return { items: allItems, sections };
  }, [commands, query, recentIds]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [displayItems]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleExecute = useCallback(
    (cmd: Command) => {
      recordExecution(cmd.id);
      close();
      Promise.resolve().then(() => cmd.execute());
    },
    [recordExecution, close]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = displayItems.items.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(count, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + count) % Math.max(count, 1));
      } else if (e.key === "Enter" && displayItems.items[selectedIndex]) {
        e.preventDefault();
        handleExecute(displayItems.items[selectedIndex]);
      }
    },
    [displayItems, selectedIndex, handleExecute]
  );

  const sectionHeaders = useMemo(() => {
    if (!displayItems.sections) return new Map<number, string>();
    const headers = new Map<number, string>();
    let offset = 0;
    for (const section of displayItems.sections) {
      headers.set(offset, section.label);
      offset += section.commands.length;
    }
    return headers;
  }, [displayItems.sections]);

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          onClick={close}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            role="dialog"
            aria-label="Command Palette"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full max-w-md mx-4 rounded-xl border border-border-bright/60 bg-base-800 shadow-2xl shadow-black/50 overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent/50 shrink-0">
                <path d="M5 1L1 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 7L15 11L11 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 2L6 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands..."
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/70 placeholder:text-xs focus:outline-none"
              />
              <kbd className="text-[10px] text-text-muted bg-base-700/80 px-1.5 py-0.5 rounded border border-border/50">ESC</kbd>
            </div>

            {/* Command list */}
            <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
              {displayItems.items.map((cmd, index) => (
                <div key={cmd.id}>
                  {sectionHeaders.has(index) && (
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-text-muted/60 font-medium">
                      {sectionHeaders.get(index)}
                    </div>
                  )}
                  <button
                    data-index={index}
                    onClick={() => handleExecute(cmd)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-100 ${
                      index === selectedIndex
                        ? "bg-accent/[0.08] text-text-primary"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className={`w-0.5 h-5 rounded-full transition-colors duration-100 ${
                          index === selectedIndex ? "bg-accent/60" : "bg-transparent"
                        }`}
                      />
                      <span className="truncate">{cmd.title}</span>
                    </div>
                    {cmd.shortcut && (
                      <kbd className="text-[10px] text-text-muted bg-base-700/60 px-1.5 py-0.5 rounded border border-border/30 ml-2 shrink-0">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                </div>
              ))}
              {displayItems.items.length === 0 && (
                <div className="px-3 py-6 text-xs text-text-muted text-center">No matching commands.</div>
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/60">
              <span><kbd className="font-medium text-text-muted/80">↑↓</kbd> navigate</span>
              <span><kbd className="font-medium text-text-muted/80">Enter</kbd> run</span>
              <span><kbd className="font-medium text-text-muted/80">Esc</kbd> close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
