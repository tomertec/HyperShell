import { describe, expect, it } from "vitest";
import { latencyTone } from "./latencyTone";

describe("latencyTone", () => {
  it("is normal up to 150ms inclusive", () => {
    expect(latencyTone(0)).toBe("normal");
    expect(latencyTone(150)).toBe("normal");
  });
  it("warns above 150ms up to 400ms inclusive", () => {
    expect(latencyTone(151)).toBe("warning");
    expect(latencyTone(400)).toBe("warning");
  });
  it("is danger above 400ms", () => {
    expect(latencyTone(401)).toBe("danger");
  });
});
