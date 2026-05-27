import { describe, expect, it } from "vitest";

import { isNewerVersion, parseLatestRelease, parseSemver } from "./updateLogic";

describe("parseSemver", () => {
  it("parses x.y.z and strips a leading v", () => {
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("0.1.9")).toEqual([0, 1, 9]);
  });

  it("returns null for non-semver input", () => {
    expect(parseSemver("nightly")).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("is true when candidate is greater", () => {
    expect(isNewerVersion("0.1.9", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.1.9", "1.0.0")).toBe(true);
    expect(isNewerVersion("0.1.9", "0.1.10")).toBe(true);
  });

  it("is false when candidate is equal or older", () => {
    expect(isNewerVersion("0.1.9", "0.1.9")).toBe(false);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(false);
  });

  it("is false when either version is unparseable", () => {
    expect(isNewerVersion("0.1.9", "garbage")).toBe(false);
  });
});

describe("parseLatestRelease", () => {
  it("extracts version and html url, stripping the v", () => {
    const result = parseLatestRelease({
      tag_name: "v0.2.0",
      html_url: "https://github.com/tomertec/HyperShell/releases/tag/v0.2.0",
      draft: false,
      prerelease: false
    });

    expect(result).toEqual({
      version: "0.2.0",
      htmlUrl: "https://github.com/tomertec/HyperShell/releases/tag/v0.2.0"
    });
  });

  it("returns null for drafts and prereleases", () => {
    expect(
      parseLatestRelease({ tag_name: "v0.2.0", html_url: "x", draft: true })
    ).toBeNull();
    expect(
      parseLatestRelease({ tag_name: "v0.2.0", html_url: "x", prerelease: true })
    ).toBeNull();
  });

  it("returns null for malformed payloads", () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({ tag_name: 5 })).toBeNull();
  });
});
