import type { LocalProfileIcon as LocalProfileIconKey } from "@hypershell/shared";

interface LocalProfileIconProps {
  icon: LocalProfileIconKey;
  className?: string;
}

const PATHS: Record<LocalProfileIconKey, string> = {
  // Chevron + underscore — the PowerShell prompt.
  powershell: "M5 6l5 6-5 6M13 18h6",
  // Filled window with a caret.
  cmd: "M3 5h18v14H3zM7 10l2.5 2L7 14M12 15h5",
  // Simple penguin silhouette.
  linux: "M12 3c2.2 0 3.5 1.8 3.5 4 0 1.6.6 2.4 1.6 3.6C18.4 12.2 19 13.5 19 15c0 3-3 5-7 5s-7-2-7-5c0-1.5.6-2.8 1.9-4.4C7.9 9.4 8.5 8.6 8.5 7c0-2.2 1.3-4 3.5-4z",
  // Dollar prompt.
  bash: "M4 5h16v14H4zM9 15c.8.7 1.9 1 3 1 1.7 0 3-.8 3-2s-1.3-1.6-3-2-3-.8-3-2 1.3-2 3-2c1.1 0 2.2.3 3 1M12 6v12",
  // Generic terminal window.
  terminal: "M3 5h18v14H3zM7 10l3 2-3 2M13 14h4"
};

export function LocalProfileIcon({ icon, className }: LocalProfileIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[icon]} />
    </svg>
  );
}
