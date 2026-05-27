import { describe, expect, it } from "vitest";

import { updateStateSchema } from "./updateSchemas";

describe("updateStateSchema", () => {
  it("accepts a minimal idle state", () => {
    const result = updateStateSchema.parse({
      status: "idle",
      currentVersion: "0.1.9"
    });

    expect(result.status).toBe("idle");
    expect(result.availableVersion).toBeUndefined();
  });

  it("accepts a downloading state with progress", () => {
    const result = updateStateSchema.parse({
      status: "downloading",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0",
      progressPercent: 42
    });

    expect(result.progressPercent).toBe(42);
  });

  it("rejects an unknown status", () => {
    expect(() =>
      updateStateSchema.parse({ status: "bogus", currentVersion: "0.1.9" })
    ).toThrow();
  });

  it("rejects progress outside 0-100", () => {
    expect(() =>
      updateStateSchema.parse({
        status: "downloading",
        currentVersion: "0.1.9",
        progressPercent: 150
      })
    ).toThrow();
  });
});
