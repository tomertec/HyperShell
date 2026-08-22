import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HOST_OPTION_DEFAULTS } from "@hypershell/shared";

vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { createFileBackedHostsRepo } from "./hostsIpc";

function tempStorePath(): { dir: string; file: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "hypershell-hosts-fallback-"));
  return { dir, file: path.join(dir, "hosts.fallback.json") };
}

describe("createFileBackedHostsRepo", () => {
  it("hydrates a sparse stored host with HOST_OPTION_DEFAULTS", () => {
    const { dir, file } = tempStorePath();
    try {
      writeFileSync(
        file,
        JSON.stringify([{ id: "a", name: "a", hostname: "a.example.com" }]),
        "utf8"
      );
      const repo = createFileBackedHostsRepo(file);
      expect(repo.get("a")).toMatchObject(HOST_OPTION_DEFAULTS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates with defaults and round-trips a shellIntegration opt-out", () => {
    const { dir, file } = tempStorePath();
    try {
      const repo = createFileBackedHostsRepo(file);
      expect(
        repo.create({ id: "b", name: "b", hostname: "b.example.com" })
      ).toMatchObject(HOST_OPTION_DEFAULTS);
      repo.create({
        id: "c",
        name: "c",
        hostname: "c.example.com",
        shellIntegration: false,
      });
      const reread = createFileBackedHostsRepo(file);
      expect(reread.get("c")?.shellIntegration).toBe(false);
      expect(reread.get("b")?.shellIntegration).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
