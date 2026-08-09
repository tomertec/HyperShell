import { describe, expect, it } from "vitest";

import {
  getTabTitleColorCssValue,
  normalizeTabTitleColorKey,
  resolveTabTitleColor,
  sanitizeTabTitleColorRules,
} from "./tabTitleColors";

describe("tab title color rules", () => {
  it("normalizes title rules case-insensitively", () => {
    expect(normalizeTabTitleColorKey("  Claude  ")).toBe("claude");
    expect(resolveTabTitleColor("CLAUDE", { claude: "orange" })).toBe("orange");
  });

  it("drops empty keys and unsupported persisted colors", () => {
    expect(
      sanitizeTabTitleColorRules({
        " Claude ": "orange",
        broken: "chartreuse",
        "   ": "blue",
      })
    ).toEqual({ claude: "orange" });
  });

  it("maps palette ids to existing theme variables", () => {
    expect(getTabTitleColorCssValue("orange")).toBe("var(--host-orange)");
    expect(getTabTitleColorCssValue("pink")).toBe("var(--host-pink)");
  });
});
