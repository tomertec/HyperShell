import { describe, expect, it } from "vitest";

import { openSessionRequestSchema } from "./schemas";

describe("openSessionRequestSchema", () => {
  it("accepts ssh requests", () => {
    const result = openSessionRequestSchema.parse({
      transport: "ssh",
      profileId: "host-1",
      cols: 120,
      rows: 40
    });

    expect(result.transport).toBe("ssh");
  });
});
