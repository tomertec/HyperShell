export interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, message, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      {icon && <div className="text-text-muted/50">{icon}</div>}
      <p className="text-xs text-text-muted">{message}</p>
      {children && (
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      )}
    </div>
  );
}
