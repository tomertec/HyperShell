import { describe, expect, it } from "vitest";

import { formatLastActive } from "./claudeResumeTime";

const NOW = Date.parse("2026-08-12T12:00:00.000Z");

describe("formatLastActive", () => {
  it("reports sub-minute gaps as just now", () => {
    expect(formatLastActive("2026-08-12T11:59:30.000Z", NOW)).toBe("just now");
  });

  it("singularises one minute and one hour", () => {
    expect(formatLastActive("2026-08-12T11:59:00.000Z", NOW)).toBe("1 minute ago");
    expect(formatLastActive("2026-08-12T11:00:00.000Z", NOW)).toBe("1 hour ago");
  });

  it("pluralises minutes and hours", () => {
    expect(formatLastActive("2026-08-12T11:45:00.000Z", NOW)).toBe("15 minutes ago");
    expect(formatLastActive("2026-08-12T10:00:00.000Z", NOW)).toBe("2 hours ago");
  });

  it("calls the previous day yesterday", () => {
    expect(formatLastActive("2026-08-11T10:00:00.000Z", NOW)).toBe("yesterday");
  });

  it("counts days beyond that", () => {
    expect(formatLastActive("2026-08-09T12:00:00.000Z", NOW)).toBe("3 days ago");
  });

  it("degrades to unknown for an unparseable timestamp", () => {
    expect(formatLastActive("not a date", NOW)).toBe("unknown");
  });
});
