import { describe, it, expect } from "vitest";
import type { UpdateState } from "@hypershell/shared";
import { resolveUpdateMode } from "./SidebarUpdateLabel";

const base = (over: Partial<UpdateState>): UpdateState => ({
  status: "idle",
  currentVersion: "0.2.5",
  ...over,
});

describe("resolveUpdateMode", () => {
  it("falls back to the version label when there is no update", () => {
    expect(resolveUpdateMode(null)).toEqual({ kind: "version" });
  });

  it.each(["idle", "checking", "up-to-date", "error"] as const)(
    "shows the version label for non-actionable status %s",
    (status) => {
      expect(resolveUpdateMode(base({ status }))).toEqual({ kind: "version" });
    }
  );

  it("maps 'available' to a download label keeping the >_ prompt motif", () => {
    expect(resolveUpdateMode(base({ status: "available", availableVersion: "0.2.6" }))).toEqual({
      kind: "available",
      label: "Update>_ v0.2.6",
      action: "download",
    });
  });

  it("maps 'manual-available' to an openRelease label", () => {
    expect(
      resolveUpdateMode(base({ status: "manual-available", availableVersion: "0.3.0" }))
    ).toEqual({ kind: "manual", label: "Update>_ v0.3.0", action: "openRelease" });
  });

  it("maps 'downloading' to a progress label with percent", () => {
    expect(
      resolveUpdateMode(base({ status: "downloading", progressPercent: 42 }))
    ).toEqual({ kind: "downloading", label: "Downloading>_ 42%", percent: 42 });
  });

  it("defaults downloading percent to 0 when missing", () => {
    expect(resolveUpdateMode(base({ status: "downloading" }))).toEqual({
      kind: "downloading",
      label: "Downloading>_ 0%",
      percent: 0,
    });
  });

  it("maps 'downloaded' to a restart label", () => {
    expect(resolveUpdateMode(base({ status: "downloaded", availableVersion: "0.2.6" }))).toEqual({
      kind: "downloaded",
      label: "Restart>_ ready",
      action: "install",
    });
  });
});
