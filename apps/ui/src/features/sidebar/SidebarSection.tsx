import { useState } from "react";

export interface SidebarSectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function SidebarSection({
  title,
  actions,
  children,
  defaultOpen = true,
  className = "",
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`px-2 flex flex-col min-h-0 ${className}`}>
      {/* The toggle and the action buttons are siblings, not nested. A button
          inside a button is invalid HTML and leaves the inner controls
          unreachable by keyboard. */}
      <div className="flex items-center justify-between w-full px-2 py-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
        </button>
        {actions && <span className="flex items-center">{actions}</span>}
      </div>
      {open && <div className="mt-0.5 flex flex-col min-h-0 flex-1">{children}</div>}
    </div>
  );
}
