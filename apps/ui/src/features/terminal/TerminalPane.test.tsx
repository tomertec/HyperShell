import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";
import { TerminalPane, isChordRepeat } from "./TerminalPane";

describe("TerminalPane", () => {
  afterEach(() => {
    setShell(null);
  });

  // Review round 1, finding 2: the focus effect's deps were
  // [ghostty.focusSurface, isVisible] — focusSurface is a stable useCallback
  // and isVisible doesn't change when a session opens, so nothing re-ran the
  // effect once a session actually opened. A newly opened tab that was
  // already visible never got focused. Exercised here via the `sessionId`
  // prop (the "preopened tab adopts an existing session" path) rather than
  // the autoConnect->openSession() flow, since both funnel through the same
  // session.sessionId transition and the same effect, and the prop path
  // avoids fighting async promise/act() batching timing in a unit test.
  it("focuses the surface once a session opens while the pane is already visible", () => {
    const ghosttySurfaceFocus = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ ghosttySurfaceFocus }).shell);

    const props = {
      transport: "local" as const,
      profileId: "p1",
      autoConnect: false,
      isVisible: true,
      fontSize: 13,
      onFontSizeChange: () => {}
    };

    const { rerender } = render(<TerminalPane {...props} />);
    expect(ghosttySurfaceFocus).not.toHaveBeenCalled();

    rerender(<TerminalPane {...props} sessionId="s1" />);

    expect(ghosttySurfaceFocus).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("does not focus while the pane is not visible", () => {
    const ghosttySurfaceFocus = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ ghosttySurfaceFocus }).shell);

    const props = {
      transport: "local" as const,
      profileId: "p1",
      autoConnect: false,
      isVisible: false,
      fontSize: 13,
      onFontSizeChange: () => {}
    };

    const { rerender } = render(<TerminalPane {...props} />);
    rerender(<TerminalPane {...props} sessionId="s1" />);

    expect(ghosttySurfaceFocus).not.toHaveBeenCalled();
  });

  // Chords arrive one per key event, so a held key repeats. Zoom wants that;
  // splitting and closing panes do not.
  describe("isChordRepeat", () => {
    it("swallows a held split chord and lets a deliberate second press through", () => {
      expect(isChordRepeat("ctrl+shift+d", 1_000)).toBe(false);
      expect(isChordRepeat("ctrl+shift+d", 1_030)).toBe(true);
      expect(isChordRepeat("ctrl+shift+d", 1_060)).toBe(true);
      expect(isChordRepeat("ctrl+shift+d", 1_400)).toBe(false);
    });

    it("never rate-limits the font-size chords", () => {
      expect(isChordRepeat("ctrl+=", 2_000)).toBe(false);
      expect(isChordRepeat("ctrl+=", 2_010)).toBe(false);
      expect(isChordRepeat("ctrl+-", 2_020)).toBe(false);
      expect(isChordRepeat("ctrl+0", 2_030)).toBe(false);
    });

    it("tracks each destructive chord separately", () => {
      expect(isChordRepeat("ctrl+shift+w", 3_000)).toBe(false);
      expect(isChordRepeat("ctrl+shift+e", 3_010)).toBe(false);
    });
  });
});
