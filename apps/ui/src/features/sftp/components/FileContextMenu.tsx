import { useEffect, useRef } from "react";

export interface FileContextMenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface FileContextMenuProps {
  x: number;
  y: number;
  actions: FileContextMenuAction[];
  onClose: () => void;
}

export function FileContextMenu({
  x,
  y,
  actions,
  onClose
}: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

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
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-base-800/95 py-0.5 shadow-xl shadow-black/30 backdrop-blur"
      style={{ left: x, top: y }}
    >
      {actions.map((item, index) =>
        item.separator ? (
          <div key={`separator-${index}`} className="my-1 border-t border-border/70" />
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
            className="flex w-full items-center px-3 py-1 text-left text-xs text-text-primary transition-colors hover:bg-base-700/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
