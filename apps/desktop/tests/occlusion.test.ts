// The ghostty E2E asserts a live surface has no occluder above it. That
// assertion is only worth anything if the detector behind it can actually see
// an occluded surface — and since the host began healing a disturbed z-order on
// WM_WINDOWPOSCHANGED, a bad state can no longer be staged against a live
// surface to prove it. So the proof lives here instead: synthetic window lists
// that are unambiguously occluded, which the computation must report as such.
//
// If computeOcclusion ever stops detecting an occluder, these fail while the
// E2E goes on quietly passing. That is the whole point of the file.
import { describe, expect, test } from "vitest";

import { computeOcclusion, describeOcclusion, type ChildWindow } from "./occlusion";

/** The surface's rect in every case below: 1000x1000, so an overlap in
 *  hundredths of the area reads directly as a percentage. */
const SURFACE_RECT = { left: 0, top: 0, right: 1000, bottom: 1000 };

function child(zIndex: number, overrides: Partial<ChildWindow> = {}): ChildWindow {
  return {
    zIndex,
    hwnd: `hwnd-${zIndex}`,
    className: `Class${zIndex}`,
    visible: true,
    rect: { ...SURFACE_RECT },
    ...overrides
  };
}

const surface = (zIndex: number): ChildWindow =>
  child(zIndex, { hwnd: "surface", className: "GhosttyWindow" });

describe("computeOcclusion", () => {
  test("reports a visible window above the surface that covers it", () => {
    const result = computeOcclusion(
      [child(0, { className: "Chrome_RenderWidgetHostHWND" }), surface(1)],
      "surface"
    );

    expect(result.zIndex).toBe(1);
    expect(result.siblingCount).toBe(2);
    expect(result.occluders).toEqual([
      { hwnd: "hwnd-0", className: "Chrome_RenderWidgetHostHWND", overlapPercent: 100 }
    ]);
  });

  test("reproduces the reported blank terminal: the leaf last, under both Chromium windows", () => {
    const result = computeOcclusion(
      [
        child(0, { className: "Chrome_RenderWidgetHostHWND" }),
        child(1, { className: "Intermediate D3D Window" }),
        surface(2)
      ],
      "surface"
    );

    expect(result.zIndex).toBe(2);
    expect(result.occluders.map((occluder) => occluder.className)).toEqual([
      "Chrome_RenderWidgetHostHWND",
      "Intermediate D3D Window"
    ]);
    expect(result.occluders.every((occluder) => occluder.overlapPercent === 100)).toBe(true);
  });

  test("the healthy stacking — surface on top — has no occluders", () => {
    const result = computeOcclusion(
      [
        surface(0),
        child(1, { className: "Chrome_RenderWidgetHostHWND" }),
        child(2, { className: "Intermediate D3D Window" })
      ],
      "surface"
    );

    expect(result.zIndex).toBe(0);
    expect(result.occluders).toEqual([]);
  });

  test("a window below the surface is not an occluder even when it overlaps fully", () => {
    const result = computeOcclusion([surface(0), child(1)], "surface");
    expect(result.occluders).toEqual([]);
  });

  test("a window above the surface that does not overlap is not an occluder", () => {
    const result = computeOcclusion(
      [
        child(0, { rect: { left: 2000, top: 2000, right: 3000, bottom: 3000 } }),
        surface(1)
      ],
      "surface"
    );
    expect(result.occluders).toEqual([]);
  });

  test("an edge-touching window above the surface is not an occluder", () => {
    // Shares the surface's right edge exactly: zero-area intersection.
    const result = computeOcclusion(
      [child(0, { rect: { left: 1000, top: 0, right: 2000, bottom: 1000 } }), surface(1)],
      "surface"
    );
    expect(result.occluders).toEqual([]);
  });

  test("a hidden window above the surface is not an occluder", () => {
    const result = computeOcclusion([child(0, { visible: false }), surface(1)], "surface");
    expect(result.occluders).toEqual([]);
  });

  test("partial overlap is reported as a percentage of the surface area", () => {
    // Covers the surface's bottom-right quadrant: 500x500 of 1000x1000.
    const result = computeOcclusion(
      [child(0, { rect: { left: 500, top: 500, right: 1500, bottom: 1500 } }), surface(1)],
      "surface"
    );
    expect(result.occluders).toHaveLength(1);
    expect(result.occluders[0].overlapPercent).toBe(25);
  });

  test("a zero-area surface reports no occluders rather than dividing by zero", () => {
    const collapsed = child(1, {
      hwnd: "surface",
      className: "GhosttyWindow",
      rect: { left: 10, top: 10, right: 10, bottom: 10 }
    });
    const result = computeOcclusion([child(0), collapsed], "surface");
    expect(result.occluders).toEqual([]);
  });

  test("throws when the surface is not among the children", () => {
    expect(() => computeOcclusion([child(0)], "surface")).toThrow(
      /surface is not among the children/
    );
  });
});

describe("describeOcclusion", () => {
  test("names the occluding classes and their coverage", () => {
    const result = computeOcclusion(
      [
        child(0, { className: "Chrome_RenderWidgetHostHWND" }),
        child(1, {
          className: "Intermediate D3D Window",
          rect: { left: 500, top: 500, right: 1500, bottom: 1500 }
        }),
        surface(2)
      ],
      "surface"
    );

    // The class names are the part that identifies this specific bug, so they
    // have to survive into the failure message.
    expect(describeOcclusion(result)).toBe(
      "ghostty surface is at z-index 2 of 3 children and is covered by: " +
        "Chrome_RenderWidgetHostHWND (100% of the surface), Intermediate D3D Window (25% of the surface)"
    );
  });
});
