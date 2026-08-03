import { describe, expect, it } from "vitest";
import { buttonClassName, iconButtonClassName } from "./buttonStyles";

describe("buttonClassName", () => {
  it("includes the shared base classes for every variant", () => {
    for (const variant of ["primary", "ghost", "outline", "danger"] as const) {
      const cls = buttonClassName(variant, "md");
      expect(cls).toContain("focus-ring");
      expect(cls).toContain("rounded-lg");
      expect(cls).toContain("duration-(--motion-fast)");
      // Labels must never wrap mid-word in narrow containers like the sidebar
      expect(cls).toContain("whitespace-nowrap");
    }
  });

  it("maps shapes, defaulting to the rounded corner radius", () => {
    expect(buttonClassName("primary", "sm")).toContain("rounded-lg");
    expect(buttonClassName("primary", "sm", "rounded")).toContain("rounded-lg");

    const pill = buttonClassName("primary", "sm", "pill");
    expect(pill).toContain("rounded-full");
    // Only one radius may survive — the primitive concatenates without tailwind-merge
    expect(pill).not.toContain("rounded-lg");
  });

  it("maps variants to semantic token colors only", () => {
    expect(buttonClassName("primary", "md")).toContain("text-accent");
    expect(buttonClassName("danger", "sm")).toContain("text-danger");
    // Never hardcoded palette colors
    expect(buttonClassName("danger", "sm")).not.toMatch(/red-\d/);
  });

  it("maps sizes", () => {
    expect(buttonClassName("primary", "sm")).toContain("text-xs");
    expect(buttonClassName("primary", "md")).toContain("text-sm");
  });
});

describe("iconButtonClassName", () => {
  it("includes base classes and variant colors", () => {
    expect(iconButtonClassName("ghost")).toContain("focus-ring");
    expect(iconButtonClassName("accent")).toContain("hover:text-accent/80");
  });
});
