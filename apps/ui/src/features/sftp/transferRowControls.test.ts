import { describe, expect, it } from "vitest";

import { transferRowControls } from "./transferRowControls";

describe("transferRowControls", () => {
  it("shows only conflict actions when a conflict is pending, regardless of status", () => {
    expect(transferRowControls({ status: "active", userInitiated: undefined, bytesTransferred: 10 }, true)).toEqual({
      conflict: true,
      pause: false,
      resume: false,
      cancel: false,
      retry: false
    });

    expect(transferRowControls({ status: "paused", userInitiated: true, bytesTransferred: 10 }, true)).toEqual({
      conflict: true,
      pause: false,
      resume: false,
      cancel: false,
      retry: false
    });
  });

  it("offers pause and cancel while active", () => {
    expect(transferRowControls({ status: "active", userInitiated: undefined, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: true,
      resume: false,
      cancel: true,
      retry: false
    });
  });

  it("offers pause and cancel while queued", () => {
    expect(transferRowControls({ status: "queued", userInitiated: undefined, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: true,
      resume: false,
      cancel: true,
      retry: false
    });
  });

  it("offers resume and cancel when paused by the user", () => {
    expect(transferRowControls({ status: "paused", userInitiated: true, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: true,
      cancel: true,
      retry: false
    });
  });

  it("offers only cancel when paused by the system (no resume)", () => {
    expect(transferRowControls({ status: "paused", userInitiated: undefined, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: true,
      retry: false
    });

    expect(transferRowControls({ status: "paused", userInitiated: false, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: true,
      retry: false
    });
  });

  it("offers retry when interrupted with bytes already transferred", () => {
    expect(transferRowControls({ status: "interrupted", userInitiated: undefined, bytesTransferred: 5 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: false,
      retry: true
    });
  });

  it("offers retry when failed with bytes already transferred", () => {
    expect(transferRowControls({ status: "failed", userInitiated: undefined, bytesTransferred: 5 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: false,
      retry: true
    });
  });

  it("withholds retry when interrupted or failed with zero bytes transferred", () => {
    expect(transferRowControls({ status: "interrupted", userInitiated: undefined, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: false,
      retry: false
    });

    expect(transferRowControls({ status: "failed", userInitiated: undefined, bytesTransferred: 0 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: false,
      retry: false
    });
  });

  it("offers no controls when completed", () => {
    expect(transferRowControls({ status: "completed", userInitiated: undefined, bytesTransferred: 100 }, false)).toEqual({
      conflict: false,
      pause: false,
      resume: false,
      cancel: false,
      retry: false
    });
  });
});
