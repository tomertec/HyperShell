// The z-order/overlap arithmetic behind the ghostty surface-occlusion check,
// split out from the Win32 enumeration in ghosttyHarness.ts so it can be unit
// tested against synthetic window lists.
//
// The split is not tidiness. The E2E assertion is "this surface has no visible
// occluder above it", and against a live surface there is no longer any way to
// stage a genuine bad state to prove that assertion can fail: the ghostty host
// now handles WM_WINDOWPOSCHANGED and re-raises itself the moment it finds it
// is not first among its siblings, so a deliberately buried surface heals
// before the next read. That self-heal is the right behaviour and has its own
// test, but it took away the evidence that the *detector* works. These pure
// functions are where that evidence lives now: occlusion.test.ts hands them
// window lists that are unambiguously occluded and requires them to say so.
//
// Deliberately dependency-free — no Playwright, no node:child_process — so the
// unit test pulls in nothing that needs a browser or a Windows API.

/** A child window of a parent, as read out of the parent's child z-order. */
export interface ChildWindow {
  /** Position in the parent's child z-order; 0 is topmost. */
  zIndex: number;
  hwnd: string;
  className: string;
  visible: boolean;
  /** Screen coordinates, as GetWindowRect reports them. */
  rect: { left: number; top: number; right: number; bottom: number };
}

/** A visible sibling stacked above the surface and overlapping its rect. */
export interface Occluder {
  hwnd: string;
  className: string;
  /** Overlapping area as a percentage of the surface's own area. */
  overlapPercent: number;
}

export interface SurfaceOcclusion {
  /** The surface's own position in the parent's child z-order; 0 is topmost. */
  zIndex: number;
  /** How many children the parent has, for context in a failure message. */
  siblingCount: number;
  occluders: Occluder[];
}

/**
 * Where `surfaceHwnd` sits among `children`, and which of them cover it.
 *
 * A sibling counts as an occluder only if it is above the surface in the
 * z-order, visible, and actually overlapping — this is the one health signal
 * the original blank terminal did not trip: the session was connected, the host
 * alive, the HWND present, visible and correctly positioned, and every event
 * flowing, while the surface sat at the bottom of the stack with
 * Chrome_RenderWidgetHostHWND painted over 100% of it.
 */
export function computeOcclusion(
  children: ChildWindow[],
  surfaceHwnd: string
): SurfaceOcclusion {
  const surface = children.find((child) => child.hwnd === surfaceHwnd);
  if (surface === undefined) {
    throw new Error(
      `surface ${surfaceHwnd} is not among the children; found ` +
        `[${children.map((child) => `${child.hwnd} ${child.className}`).join(", ")}]`
    );
  }

  const surfaceArea =
    Math.max(0, surface.rect.right - surface.rect.left) *
    Math.max(0, surface.rect.bottom - surface.rect.top);

  const occluders = children
    .filter((child) => child.zIndex < surface.zIndex && child.visible)
    .map((child) => {
      const width = Math.max(
        0,
        Math.min(child.rect.right, surface.rect.right) - Math.max(child.rect.left, surface.rect.left)
      );
      const height = Math.max(
        0,
        Math.min(child.rect.bottom, surface.rect.bottom) - Math.max(child.rect.top, surface.rect.top)
      );
      return {
        hwnd: child.hwnd,
        className: child.className,
        overlapPercent: surfaceArea === 0 ? 0 : Math.round(((width * height) / surfaceArea) * 100)
      };
    })
    .filter((occluder) => occluder.overlapPercent > 0);

  return { zIndex: surface.zIndex, siblingCount: children.length, occluders };
}

/** Renders an occlusion result as the failure message a reader can act on —
 *  the occluding window classes are the signal that names this exact bug. */
export function describeOcclusion(occlusion: SurfaceOcclusion): string {
  const stack = occlusion.occluders
    .map((occluder) => `${occluder.className} (${occluder.overlapPercent}% of the surface)`)
    .join(", ");
  return (
    `ghostty surface is at z-index ${occlusion.zIndex} of ${occlusion.siblingCount} children ` +
    `and is covered by: ${stack}`
  );
}
