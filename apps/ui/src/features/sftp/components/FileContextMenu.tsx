import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [position, setPosition] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) {
      return;
    }

    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x;
    let top = y;

    if (left + rect.width + margin > viewportWidth) {
      left = Math.max(margin, viewportWidth - rect.width - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (top + rect.height + margin > viewportHeight) {
      const aboveTop = y - rect.height;
      top = aboveTop >= margin ? aboveTop : Math.max(margin, viewportHeight - rect.height - margin);
    }
    if (top < margin) {
      top = margin;
    }

    setPosition({ left, top, ready: true });
  }, [actions, x, y]);

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

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[9999] min-w-44 overflow-hidden rounded-md border border-border bg-base-800/95 py-0.5 shadow-xl shadow-black/30 backdrop-blur"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden"
      }}
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
    </div>,
    document.body
  );
}
