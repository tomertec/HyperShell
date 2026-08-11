import { describe, expect, it } from "vitest";

import { workspaceTabSchema } from "./schemas";

const baseTab = {
  transport: "ssh" as const,
  profileId: "host-1",
  title: "Production",
};

describe("workspaceTabSchema terminal font size", () => {
  it("preserves a supported half-pixel font size", () => {
    const parsed = workspaceTabSchema.parse({ ...baseTab, fontSize: 13.5 });

    expect(parsed.fontSize).toBe(13.5);
  });

  it("keeps legacy workspace tabs valid without a font size", () => {
    expect(workspaceTabSchema.safeParse(baseTab).success).toBe(true);
  });

  it("rejects unsupported precision and out-of-range font sizes", () => {
    expect(workspaceTabSchema.safeParse({ ...baseTab, fontSize: 13.25 }).success).toBe(false);
    expect(workspaceTabSchema.safeParse({ ...baseTab, fontSize: 7.5 }).success).toBe(false);
    expect(workspaceTabSchema.safeParse({ ...baseTab, fontSize: 32.5 }).success).toBe(false);
  });
});
