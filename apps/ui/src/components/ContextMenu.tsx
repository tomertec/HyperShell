import { useEffect, useRef } from "react";

export interface ContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  /** Render custom content instead of the default button layout */
  customContent?: React.ReactNode;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Clamp position so menu stays within viewport
  const menuWidth = 220;
  const menuHeight = actions.reduce((h, a) => h + (a.separator ? 9 : 32), 0);
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);
  const finalX = Math.max(8, clampedX);
  const finalY = Math.max(8, clampedY);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-border bg-base-800/95 py-1 font-[var(--font-outfit)] text-xs shadow-xl shadow-black/30 backdrop-blur"
      style={{ left: finalX, top: finalY }}
    >
      {actions.map((item, index) =>
        item.separator ? (
          <div key={`separator-${index}`} className="my-1 border-t border-border/70" />
        ) : item.customContent ? (
          <div key={`${item.label}-${index}`} role="menuitem">
            {item.customContent}
          </div>
        ) : (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) {
                return;
              }

              item.action();
              onClose();
            }}
            className={[
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-text-primary hover:bg-base-700/80",
            ].join(" ")}
          >
            {item.icon !== undefined && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut !== undefined && (
              <span className="ml-auto shrink-0 text-xs text-text-muted">
                {item.shortcut}
              </span>
            )}
          </button>
        )
      )}
    </div>
  );
}
