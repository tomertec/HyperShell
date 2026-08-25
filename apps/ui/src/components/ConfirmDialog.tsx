import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./ui/Button";
import { MOTION_BASE, MOTION_SLOW, EASE_STANDARD } from "../lib/motion";
import { useOverlayGuard } from "../features/terminal/nativeOverlayGuard";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useOverlayGuard(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    },
    [onConfirm],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          onMouseDown={(e) => {
            mouseDownTargetRef.current = e.target;
          }}
          onClick={(e) => {
            if (
              e.target === backdropRef.current &&
              mouseDownTargetRef.current === backdropRef.current
            )
              onCancel();
          }}
          onKeyDown={handleKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION_BASE }}
        >
          <motion.div
            className="mx-4 w-full max-w-sm rounded-xl border border-border-bright/60 bg-base-800 shadow-overlay"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: MOTION_SLOW, ease: [...EASE_STANDARD] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold text-text-primary tracking-tight">
                {title}
              </h2>
              <p className="mt-2 text-sm text-text-secondary">{message}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                ref={confirmBtnRef}
                variant={variant === "danger" ? "danger" : "primary"}
                size="sm"
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
