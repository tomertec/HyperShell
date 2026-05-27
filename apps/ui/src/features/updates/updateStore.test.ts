import { beforeEach, describe, expect, it } from "vitest";

import { useUpdateStore, shouldShowBanner } from "./updateStore";

describe("updateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState({ update: null, dismissedVersion: null });
  });

  it("stores pushed state", () => {
    useUpdateStore.getState().setState({
      status: "available",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0"
    });
    expect(useUpdateStore.getState().update?.status).toBe("available");
  });

  it("records the dismissed version", () => {
    useUpdateStore.getState().setState({
      status: "available",
      currentVersion: "0.1.9",
      availableVersion: "0.2.0"
    });
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().dismissedVersion).toBe("0.2.0");
  });

  it("shows the banner for actionable states", () => {
    expect(
      shouldShowBanner(
        { status: "available", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        null
      )
    ).toBe(true);
    expect(
      shouldShowBanner(
        { status: "downloaded", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        null
      )
    ).toBe(true);
  });

  it("hides the banner for idle/up-to-date and dismissed versions", () => {
    expect(shouldShowBanner({ status: "idle", currentVersion: "0.1.9" }, null)).toBe(false);
    expect(
      shouldShowBanner({ status: "up-to-date", currentVersion: "0.1.9" }, null)
    ).toBe(false);
    expect(
      shouldShowBanner(
        { status: "available", currentVersion: "0.1.9", availableVersion: "0.2.0" },
        "0.2.0"
      )
    ).toBe(false);
  });

  it("keeps the banner while downloading even if dismissed earlier", () => {
    expect(
      shouldShowBanner(
        { status: "downloading", currentVersion: "0.1.9", availableVersion: "0.2.0", progressPercent: 10 },
        "0.2.0"
      )
    ).toBe(true);
  });
});
