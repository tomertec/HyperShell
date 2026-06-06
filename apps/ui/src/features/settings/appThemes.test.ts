import { describe, it, expect } from "vitest";
import { appThemeVariant, resolveAppTheme, APP_THEMES } from "./appThemes";

describe("resolveAppTheme", () => {
  it("maps system → dark default when OS prefers dark", () => {
    expect(resolveAppTheme("system", true)).toBe("default");
  });

  it("maps system → light default when OS prefers light", () => {
    expect(resolveAppTheme("system", false)).toBe("default-light");
  });

  it("passes through a known theme id unchanged", () => {
    expect(resolveAppTheme("mocha", true)).toBe("mocha");
    expect(resolveAppTheme("latte", false)).toBe("latte");
  });

  it("falls back to dark default for an unknown id", () => {
    expect(resolveAppTheme("does-not-exist", true)).toBe("default");
  });
});

describe("appThemeVariant", () => {
  it("returns the registered variant for known themes", () => {
    expect(appThemeVariant("mocha")).toBe("dark");
    expect(appThemeVariant("latte")).toBe("light");
    expect(appThemeVariant("gruvbox-light")).toBe("light");
  });

  it("defaults unknown ids to dark", () => {
    expect(appThemeVariant("nope")).toBe("dark");
  });

  it("every registered theme declares a light or dark variant", () => {
    for (const t of APP_THEMES) {
      expect(t.variant === "light" || t.variant === "dark").toBe(true);
    }
  });
});
