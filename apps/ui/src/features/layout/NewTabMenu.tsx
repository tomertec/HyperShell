import { useEffect, useRef } from "react";
import type { LocalProfileRecord } from "@hypershell/shared";
import { LocalProfileIcon } from "../local/LocalProfileIcon";

interface NewTabMenuProps {
  profiles: LocalProfileRecord[];
  onSelect: (profile: LocalProfileRecord) => void;
  onClose: () => void;
}

export function NewTabMenu({ profiles, onSelect, onClose }: NewTabMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="menu"
      aria-label="New tab"
      className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-md border border-border/60 bg-base-800 py-1 shadow-lg"
    >
      {profiles.map((profile) => (
        <button
          key={profile.id}
          role="menuitem"
          type="button"
          onClick={() => {
            onSelect(profile);
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-base-700 hover:text-text-primary"
        >
          <LocalProfileIcon icon={profile.icon} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{profile.name}</span>
        </button>
      ))}
    </div>
  );
}
