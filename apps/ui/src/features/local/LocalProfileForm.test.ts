import { describe, expect, it } from "vitest";
import { isUniqueNameConflict, parseArgs, shouldIncludeEnvVarsInUpsert } from "./LocalProfileForm";

describe("parseArgs", () => {
  it("splits on whitespace and drops empties", () => {
    expect(parseArgs("-d Ubuntu-24.04")).toEqual(["-d", "Ubuntu-24.04"]);
  });

  it("round-trips with join(' ') for single-space-separated args", () => {
    const original = ["-d", "Ubuntu-24.04"];
    expect(parseArgs(original.join(" "))).toEqual(original);
  });

  it("collapses repeated whitespace and trims", () => {
    expect(parseArgs("  -NoLogo   -NoExit  ")).toEqual(["-NoLogo", "-NoExit"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseArgs("")).toEqual([]);
    expect(parseArgs("   ")).toEqual([]);
  });
});

describe("isUniqueNameConflict", () => {
  it("matches the local_profiles.name UNIQUE constraint message", () => {
    expect(
      isUniqueNameConflict(new Error("UNIQUE constraint failed: local_profiles.name"))
    ).toBe(true);
  });

  it("matches when Electron IPC prefixes the message", () => {
    expect(
      isUniqueNameConflict(
        new Error(
          "Error invoking remote method 'local-profiles:upsert': Error: UNIQUE constraint failed: local_profiles.name"
        )
      )
    ).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isUniqueNameConflict(new Error("ENOENT: no such file"))).toBe(false);
    expect(isUniqueNameConflict("some string error")).toBe(false);
  });
});

describe("shouldIncludeEnvVarsInUpsert", () => {
  it("always includes envVars for a new profile, loaded or not", () => {
    expect(shouldIncludeEnvVarsInUpsert(true, true)).toBe(true);
    expect(shouldIncludeEnvVarsInUpsert(true, false)).toBe(true);
  });

  it("includes envVars for an existing profile only when they were loaded", () => {
    expect(shouldIncludeEnvVarsInUpsert(false, true)).toBe(true);
    expect(shouldIncludeEnvVarsInUpsert(false, false)).toBe(false);
  });
});
