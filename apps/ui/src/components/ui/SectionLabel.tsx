export interface SectionLabelProps {
  className?: string;
  children: React.ReactNode;
}

export function SectionLabel({ className = "", children }: SectionLabelProps) {
  return (
    <div
      className={`select-none text-[10px] font-medium uppercase tracking-widest text-text-muted/70 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
