import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";

export interface TerminalSearchBarProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
  onFocusTerminal: () => void;
}

export function TerminalSearchBar({
  searchAddon,
  onClose,
  onFocusTerminal
}: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [matchCount, setMatchCount] = useState<{ resultIndex: number; resultCount: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!searchAddon) return;

    const disposable = searchAddon.onDidChangeResults((e) => {
      setMatchCount(e);
    });

    return () => {
      disposable.dispose();
    };
  }, [searchAddon]);

  const doSearch = useCallback(
    (direction: "next" | "previous") => {
      if (!searchAddon || !query) {
        setMatchCount(null);
        return;
      }

      const options = { caseSensitive, regex };
      if (direction === "next") {
        searchAddon.findNext(query, options);
      } else {
        searchAddon.findPrevious(query, options);
      }
    },
    [searchAddon, query, caseSensitive, regex]
  );

  // Re-run search when query or options change
  useEffect(() => {
    if (!query) {
      searchAddon?.clearDecorations();
      setMatchCount(null);
      return;
    }
    doSearch("next");
  }, [query, caseSensitive, regex, searchAddon, doSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        searchAddon?.clearDecorations();
        onClose();
        onFocusTerminal();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          doSearch("previous");
        } else {
          doSearch("next");
        }
      }
    },
    [doSearch, onClose, onFocusTerminal, searchAddon]
  );

  const close = useCallback(() => {
    searchAddon?.clearDecorations();
    onClose();
    onFocusTerminal();
  }, [searchAddon, onClose, onFocusTerminal]);

  const matchLabel =
    matchCount !== null && query
      ? matchCount.resultCount > 0
        ? `${matchCount.resultIndex + 1} of ${matchCount.resultCount}`
        : "No results"
      : null;

  return (
    <div className="absolute top-2 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-border-bright bg-base-800/95 backdrop-blur-sm px-2 py-1.5 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find..."
        spellCheck={false}
        autoComplete="off"
        className="w-48 bg-base-900 border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
      />

      {matchLabel && (
        <span className="text-[10px] text-text-muted whitespace-nowrap min-w-[4.5rem] text-center">
          {matchLabel}
        </span>
      )}

      {/* Case sensitive toggle */}
      <button
        type="button"
        title="Match case"
        onClick={() => setCaseSensitive((v) => !v)}
        className={`flex items-center justify-center w-6 h-6 rounded text-xs font-bold transition-colors ${
          caseSensitive
            ? "bg-accent/20 text-accent border border-accent/40"
            : "text-text-muted hover:text-text-secondary border border-transparent"
        }`}
      >
        Aa
      </button>

      {/* Regex toggle */}
      <button
        type="button"
        title="Use regular expression"
        onClick={() => setRegex((v) => !v)}
        className={`flex items-center justify-center w-6 h-6 rounded text-xs font-mono transition-colors ${
          regex
            ? "bg-accent/20 text-accent border border-accent/40"
            : "text-text-muted hover:text-text-secondary border border-transparent"
        }`}
      >
        .*
      </button>

      {/* Previous */}
      <button
        type="button"
        title="Previous match (Shift+Enter)"
        onClick={() => doSearch("previous")}
        className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-base-700 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,8 6,4 10,8" />
        </svg>
      </button>

      {/* Next */}
      <button
        type="button"
        title="Next match (Enter)"
        onClick={() => doSearch("next")}
        className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-base-700 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {/* Close */}
      <button
        type="button"
        title="Close (Escape)"
        onClick={close}
        className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-base-700 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  );
}
