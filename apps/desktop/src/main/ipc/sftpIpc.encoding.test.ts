import { describe, expect, it } from "vitest";

import { normalizeFileContent } from "./sftpIpc";

describe("normalizeFileContent", () => {
  it("returns plain UTF-8 text as utf-8", () => {
    const result = normalizeFileContent(Buffer.from("hello wörld", "utf8"));

    expect(result.encoding).toBe("utf-8");
    expect(result.content).toBe("hello wörld");
  });

  it("classifies NUL-containing content as base64", () => {
    const result = normalizeFileContent(Buffer.from([0x68, 0x00, 0x69]));

    expect(result.encoding).toBe("base64");
  });

  it("classifies invalid UTF-8 as base64 rather than corrupting it", () => {
    // 0xA9 is a lone continuation byte — valid latin-1, invalid UTF-8, no NULs.
    const latin1 = Buffer.from([0x63, 0x6f, 0x70, 0x79, 0xa9]);

    const result = normalizeFileContent(latin1);

    expect(result.encoding).toBe("base64");
    expect(Buffer.from(result.content, "base64").equals(latin1)).toBe(true);
  });

  it("does not truncate a large valid UTF-8 file to its first 8KB", () => {
    const large = Buffer.from("é".repeat(20000), "utf8");

    const result = normalizeFileContent(large);

    expect(result.encoding).toBe("utf-8");
    expect(result.content).toHaveLength(20000);
  });
});
