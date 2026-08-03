export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-base-750 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
      {children}
    </kbd>
  );
}
