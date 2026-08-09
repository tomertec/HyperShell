export const TAB_TITLE_COLOR_OPTIONS = [
  { id: "orange", label: "Orange", cssValue: "var(--host-orange)" },
  { id: "blue", label: "Blue", cssValue: "var(--host-blue)" },
  { id: "green", label: "Green", cssValue: "var(--host-green)" },
  { id: "purple", label: "Purple", cssValue: "var(--host-purple)" },
  { id: "red", label: "Red", cssValue: "var(--host-red)" },
  { id: "yellow", label: "Yellow", cssValue: "var(--host-yellow)" },
  { id: "pink", label: "Pink", cssValue: "var(--host-pink)" },
] as const;

export type TabTitleColorId = (typeof TAB_TITLE_COLOR_OPTIONS)[number]["id"];
export type TabTitleColorRules = Record<string, TabTitleColorId>;

const COLOR_IDS = new Set<string>(TAB_TITLE_COLOR_OPTIONS.map((option) => option.id));
const CSS_VALUES = Object.fromEntries(
  TAB_TITLE_COLOR_OPTIONS.map((option) => [option.id, option.cssValue])
) as Record<TabTitleColorId, string>;

export function normalizeTabTitleColorKey(title: string): string {
  return title.trim().toLowerCase();
}

export function sanitizeTabTitleColorRules(value: unknown): TabTitleColorRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, TabTitleColorId]> = [];
  for (const [title, color] of Object.entries(value)) {
    const key = normalizeTabTitleColorKey(title);
    if (key && typeof color === "string" && COLOR_IDS.has(color)) {
      entries.push([key, color as TabTitleColorId]);
    }
  }

  return Object.fromEntries(entries);
}

export function resolveTabTitleColor(
  title: string,
  rules: TabTitleColorRules
): TabTitleColorId | null {
  return rules[normalizeTabTitleColorKey(title)] ?? null;
}

export function getTabTitleColorCssValue(color: TabTitleColorId): string {
  return CSS_VALUES[color];
}
