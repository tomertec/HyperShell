import { describe, expect, it } from "vitest";
import { inputClassName, selectClassName } from "./fieldStyles";

describe("fieldStyles", () => {
  it("input recipe keeps the settings-panel field anatomy", () => {
    expect(inputClassName).toContain("bg-base-900");
    expect(inputClassName).toContain("focus:border-accent/40");
    expect(inputClassName).toContain("hover:border-border-bright");
    expect(inputClassName).toContain("duration-(--motion-fast)");
  });

  it("select shares the input recipe", () => {
    expect(selectClassName).toContain("bg-base-900");
    expect(selectClassName).toContain("focus:border-accent/40");
  });
});
