export type AppThemeVariant = "light" | "dark";

export interface AppThemeMeta {
  /** DOM id written to `data-theme`; matches the CSS block in index.css. */
  id: string;
  label: string;
  variant: AppThemeVariant;
  /** Representative color for the picker swatch dot (the theme background). */
  swatch: string;
}

/**
 * App-chrome themes. Each id has a matching `html[data-theme="<id>"]` block in
 * index.css that defines the full CSS-variable palette. `default` / `default-light`
 * are the original HyperShell looks (default lives in `:root`).
 *
 * The terminal color scheme is a separate, independent picker — see terminalTheme.ts.
 */
export const APP_THEMES: AppThemeMeta[] = [
  { id: "default", label: "HyperShell", variant: "dark", swatch: "#07111f" },
  { id: "mocha", label: "Mocha", variant: "dark", swatch: "#1e1e2e" },
  { id: "macchiato", label: "Macchiato", variant: "dark", swatch: "#24273a" },
  { id: "frappe", label: "Frappé", variant: "dark", swatch: "#303446" },
  { id: "nord", label: "Nord", variant: "dark", swatch: "#2e3440" },
  { id: "dracula", label: "Dracula", variant: "dark", swatch: "#282a36" },
  { id: "tokyo-night", label: "Tokyo Night", variant: "dark", swatch: "#1a1b26" },
  { id: "cherry", label: "Cherry", variant: "dark", swatch: "#18141a" },
  { id: "ocean", label: "Ocean", variant: "dark", swatch: "#0d1b2a" },
  { id: "amber", label: "Amber", variant: "dark", swatch: "#1a1710" },
  { id: "mint", label: "Mint", variant: "dark", swatch: "#0f1a16" },
  { id: "default-light", label: "HyperShell Light", variant: "light", swatch: "#e3e8f0" },
  { id: "latte", label: "Latte", variant: "light", swatch: "#eff1f5" },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", variant: "light", swatch: "#faf4ed" },
  { id: "gruvbox-light", label: "Gruvbox Light", variant: "light", swatch: "#fbf1c7" },
];

const APP_THEME_IDS = new Set(APP_THEMES.map((t) => t.id));

export const DEFAULT_DARK_THEME = "default";
export const DEFAULT_LIGHT_THEME = "default-light";

export function isAppThemeId(value: string): boolean {
  return APP_THEME_IDS.has(value);
}

export function appThemeVariant(id: string): AppThemeVariant {
  return APP_THEMES.find((t) => t.id === id)?.variant ?? "dark";
}

/**
 * Resolve the persisted setting (a theme id or "system") plus the OS preference
 * into a concrete theme id. Unknown ids fall back to the dark default.
 */
export function resolveAppTheme(appTheme: string, prefersDark: boolean): string {
  if (appTheme === "system") {
    return prefersDark ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  }
  return isAppThemeId(appTheme) ? appTheme : DEFAULT_DARK_THEME;
}
