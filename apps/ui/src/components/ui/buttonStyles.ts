export type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md";
export type ButtonShape = "rounded" | "pill";
export type IconButtonVariant = "ghost" | "accent";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap cursor-pointer select-none transition-colors duration-(--motion-fast) ease-standard focus-ring disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_SHAPES: Record<ButtonShape, string> = {
  rounded: "rounded-lg",
  pill: "rounded-full",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25",
  outline:
    "border border-border bg-base-750/70 text-text-secondary hover:border-accent/35 hover:text-text-primary",
  ghost: "text-text-secondary hover:text-text-primary hover:bg-base-700/60",
  danger: "border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25",
};

const ICON_BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md p-1 cursor-pointer transition-colors duration-(--motion-fast) ease-standard focus-ring disabled:cursor-not-allowed disabled:opacity-50";

const ICON_BUTTON_VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-text-muted hover:text-text-primary hover:bg-base-700/60",
  accent: "text-text-muted hover:text-accent/80 hover:bg-accent/[0.06]",
};

export function buttonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  shape: ButtonShape = "rounded"
): string {
  return `${BUTTON_BASE} ${BUTTON_SHAPES[shape]} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]}`;
}

export function iconButtonClassName(variant: IconButtonVariant): string {
  return `${ICON_BUTTON_BASE} ${ICON_BUTTON_VARIANTS[variant]}`;
}
