import { useCallback, useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { IconButton } from "../../components/ui/IconButton";
import { MOTION_BASE, MOTION_SLOW, EASE_STANDARD } from "../../lib/motion";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}

const SIZE_CLASSES = { sm: "max-w-sm", md: "max-w-2xl", lg: "max-w-4xl" } as const;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function Modal({ open, onClose, title, children, size = "md", footer }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const titleId = useId();

  const getFocusable = useCallback((): HTMLElement[] => {
    const dialog = dialogRef.current;
    if (!dialog) return [];
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((node) => node.offsetParent !== null || node === document.activeElement);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Move focus into the dialog on open and hand it back to whatever was focused
  // before, so keyboard and screen-reader users are not dropped at the top of
  // the document when the dialog closes.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const [first] = getFocusable();
      (first ?? dialogRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, getFocusable]);

  // Keep Tab cycling inside the dialog while it is open.
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inDialog = active instanceof Node && dialogRef.current?.contains(active);

    if (e.shiftKey) {
      if (!inDialog || active === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (!inDialog || active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onMouseDown={(e) => {
            mouseDownTargetRef.current = e.target;
          }}
          onClick={(e) => {
            if (e.target === backdropRef.current && mouseDownTargetRef.current === backdropRef.current) onClose();
          }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/60 p-4 sm:p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION_BASE }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
            className={`my-8 flex max-h-[calc(100dvh-4rem)] w-full ${SIZE_CLASSES[size]} flex-col rounded-xl border border-border-bright/60 bg-base-800 shadow-overlay focus:outline-none`}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: MOTION_SLOW, ease: [...EASE_STANDARD] }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 id={titleId} className="text-sm font-semibold text-text-primary tracking-tight">
                {title}
              </h2>
              <IconButton variant="ghost" onClick={onClose} aria-label={`Close ${title}`}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </IconButton>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
