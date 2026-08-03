import { describe, expect, it } from "vitest";
import {
  getLocalProfileEnvVarsRequestSchema,
  localProfileRecordSchema,
  openSessionRequestSchema,
  upsertLocalProfileRequestSchema
} from "./schemas";

describe("local profile schemas", () => {
  it("accepts a full profile record", () => {
    const parsed = localProfileRecordSchema.parse({
      id: "p1",
      name: "PowerShell",
      executable: "C:\\pwsh.exe",
      args: [],
      startingDirectory: null,
      icon: "powershell",
      color: null,
      elevated: false,
      source: "detected",
      detectKey: "pwsh7",
      isAvailable: true,
      isHidden: false,
      sortOrder: 1
    });

    expect(parsed.icon).toBe("powershell");
  });

  it("rejects an icon outside the fixed set", () => {
    expect(() =>
      localProfileRecordSchema.parse({
        id: "p1",
        name: "X",
        executable: "x.exe",
        args: [],
        startingDirectory: null,
        icon: "rocket",
        color: null,
        elevated: false,
        source: "user",
        detectKey: null,
        isAvailable: true,
        isHidden: false,
        sortOrder: 0
      })
    ).toThrow();
  });

  it("requires a non-empty executable on upsert", () => {
    expect(() =>
      upsertLocalProfileRequestSchema.parse({ id: "p1", name: "X", executable: "" })
    ).toThrow();
  });

  it("strips renderer-supplied executable from a local open-session request", () => {
    const parsed = openSessionRequestSchema.parse({
      transport: "local",
      profileId: "p1",
      cols: 80,
      rows: 24,
      localOptions: { executable: "C:\\evil.exe" }
    });

    expect("localOptions" in parsed).toBe(false);
  });

  it("requires a non-empty id to look up a profile's env vars", () => {
    expect(getLocalProfileEnvVarsRequestSchema.parse({ id: "p1" })).toEqual({ id: "p1" });
    expect(() => getLocalProfileEnvVarsRequestSchema.parse({ id: "" })).toThrow();
    expect(() => getLocalProfileEnvVarsRequestSchema.parse({})).toThrow();
  });
});
