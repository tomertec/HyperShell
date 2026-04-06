import { describe, expect, it } from "vitest";

import { roundTripSecret } from "./secureStorage";

describe("secureStorage", () => {
  it("round-trips a secret payload", () => {
    expect(roundTripSecret("s3cr3t")).toBe("s3cr3t");
  });
});
