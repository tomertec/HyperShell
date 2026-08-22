import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { StoreApi } from "zustand/vanilla";

import { EditorApp } from "./EditorApp";
import type { EditorState } from "./stores/editorStore";
import { createFakeShell } from "../../lib/fakeShell";
import { setShell, type ShellApi } from "../../lib/shell";

// EditorPane pulls in CodeMirror, which isn't what these tests exercise —
// they cover EditorApp's own save-conflict orchestration. Stub it out so
// mounting a non-readOnly tab doesn't require a real editor surface.
// The stub's button stands in for a keystroke: the real EditorPane also writes
// content straight to the store for the tab it was given.
vi.mock("./components/EditorPane", () => ({
  EditorPane: ({ store, tabId }: { store: StoreApi<EditorState>; tabId: string }) => (
    <div data-testid="editor-pane-stub">
      <button
        type="button"
        onClick={() => store.getState().updateTab(tabId, { content: "hello typed", dirty: true })}
      >
        simulate keystroke
      </button>
    </div>
  ),
}));

type Hypershell = NonNullable<Window["hypershell"]>;
type OpenFileListener = (event: { remotePath: string; sftpSessionId: string }) => void;

function installHypershell(overrides: Partial<Hypershell>): void {
  setShell(createFakeShell(mockHypershell(overrides) as Partial<ShellApi>).shell);
}

afterEach(() => {
  setShell(null);
});

function mockHypershell(overrides: Partial<Hypershell>): Hypershell {
  return {
    onEditorOpenFile: vi.fn(() => () => {}),
    onEditorSessionClosed: vi.fn(() => () => {}),
    sftpReadFile: vi.fn(),
    sftpWriteFile: vi.fn(),
    sftpStat: vi.fn(),
    sftpTransferStart: vi.fn(),
    fsShowSaveDialog: vi.fn(),
    ...overrides,
  };
}

function ctrlKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true }));
}

describe("EditorApp save-conflict handling", () => {
  it("I-1: a failed read leaves the tab read-only, shows the real error (not the binary notice), and blocks save", async () => {
    let openFileListener: OpenFileListener | null = null;
    const sftpWriteFile = vi.fn();
    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile: vi.fn().mockRejectedValue(new Error("Permission denied")),
      sftpWriteFile,
    });

    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/secret.txt", sftpSessionId: "s1" });
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to load secret.txt")).toBeTruthy();
    });
    // Shown twice by design — once in the toolbar's error slot, once in the
    // read-only notice body — so use getAllByText rather than assuming one.
    expect(screen.getAllByText("Permission denied").length).toBeGreaterThan(0);
    // Must not be mistaken for (or fall back to) the binary-file notice.
    expect(screen.queryByText("secret.txt is a binary file")).toBeNull();
    expect(screen.queryByTestId("editor-pane-stub")).toBeNull();

    // The write chokepoint's readOnly guard, not UI disablement, is what
    // must stop this: fire the shortcut directly rather than clicking a
    // (separately, also disabled) toolbar button.
    act(() => {
      ctrlKey("s");
    });
    expect(sftpWriteFile).not.toHaveBeenCalled();
  });

  it("I-2a + I-2b: Save As refuses an existing destination, then on success updates the tab's path, name and language", async () => {
    let openFileListener: OpenFileListener | null = null;

    const sftpReadFile = vi.fn().mockResolvedValue({
      content: "hello",
      encoding: "utf-8",
      size: 5,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });

    const sftpWriteFile = vi
      .fn()
      // Ordinary Ctrl+S: conditional on the read's base version — conflicts.
      .mockResolvedValueOnce({ status: "conflict", size: 999, modifiedAt: "2026-08-13T01:00:00.000Z" })
      // Accepted Save As: unconditional write to the new path.
      .mockResolvedValueOnce({ status: "written", size: 42, modifiedAt: "2026-08-13T02:00:00.000Z" });

    const sftpStat = vi
      .fn()
      // First attempted destination already exists.
      .mockResolvedValueOnce({
        name: "taken.txt",
        path: "/r/taken.txt",
        size: 1,
        modifiedAt: "2026-08-13T00:00:00.000Z",
        isDirectory: false,
        permissions: 0,
        owner: 0,
        group: 0,
      })
      // Second attempted destination is free.
      .mockRejectedValueOnce(new Error("No such file"));

    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile,
      sftpWriteFile,
      sftpStat,
    });

    const user = userEvent.setup();
    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/original.txt", sftpSessionId: "s1" });
    });

    await screen.findByTestId("editor-pane-stub");
    expect(screen.getByText("original.txt")).toBeTruthy();

    act(() => {
      ctrlKey("s");
    });

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Remote file changed" })).toBeTruthy();
    });
    expect(sftpWriteFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: "/r/original.txt",
        expectedSize: 5,
        expectedModifiedAt: "2026-08-13T00:00:00.000Z",
      })
    );

    const input = screen.getByLabelText("Or save a copy as:");
    await user.clear(input);
    await user.type(input, "/r/taken.txt");
    await user.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => {
      expect(screen.getByText("/r/taken.txt already exists — choose a different name.")).toBeTruthy();
    });
    // Refused before ever writing — the dialog stays open on the same conflict.
    expect(sftpWriteFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Remote file changed" })).toBeTruthy();

    await user.clear(input);
    await user.type(input, "/r/renamed.md");
    await user.click(screen.getByRole("button", { name: "Save As" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Remote file changed" })).toBeNull();
    });

    expect(sftpWriteFile).toHaveBeenCalledTimes(2);
    const secondCallArgs = sftpWriteFile.mock.calls[1][0] as Record<string, unknown>;
    expect(secondCallArgs.path).toBe("/r/renamed.md");
    // Save As is unconditional — no stale expectations sent with the new path.
    expect("expectedSize" in secondCallArgs).toBe(false);
    expect("expectedModifiedAt" in secondCallArgs).toBe(false);

    // I-2b: tab identity (label + status-bar path) now follows the new file,
    // not just its remotePath.
    expect(screen.getByText("renamed.md")).toBeTruthy();
    expect(screen.getByText("/r/renamed.md")).toBeTruthy();
    expect(screen.queryByText("original.txt")).toBeNull();
  });

  it("FIX 2: a missing sftpWriteFile bridge method fails the save instead of reporting success", async () => {
    let openFileListener: OpenFileListener | null = null;

    const sftpReadFile = vi.fn().mockResolvedValue({
      content: "hello",
      encoding: "utf-8",
      size: 5,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });

    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile,
      sftpWriteFile: undefined,
    });

    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/original.txt", sftpSessionId: "s1" });
    });
    await screen.findByTestId("editor-pane-stub");

    act(() => {
      ctrlKey("s");
    });

    await waitFor(() => {
      // The seam throws on the drifted method; the save path surfaces it as
      // the tab's error instead of falling through to the success branch.
      expect(screen.getByText(/sftpWriteFile/)).toBeTruthy();
    });
    // Must not have been mistaken for a successful save — no conflict dialog,
    // and re-pressing Ctrl+S must still be possible (the tab wasn't marked
    // clean behind a null base version).
    expect(screen.queryByRole("dialog", { name: "Remote file changed" })).toBeNull();
  });

  it("FIX 5: a failed Overwrite surfaces its error in the dialog instead of appearing inert", async () => {
    let openFileListener: OpenFileListener | null = null;

    const sftpReadFile = vi.fn().mockResolvedValue({
      content: "hello",
      encoding: "utf-8",
      size: 5,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });
    const sftpWriteFile = vi
      .fn()
      .mockResolvedValueOnce({ status: "conflict", size: 999, modifiedAt: "2026-08-13T01:00:00.000Z" })
      .mockRejectedValueOnce(new Error("disk full"));

    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile,
      sftpWriteFile,
    });

    const user = userEvent.setup();
    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/original.txt", sftpSessionId: "s1" });
    });
    await screen.findByTestId("editor-pane-stub");

    act(() => {
      ctrlKey("s");
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Remote file changed" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Overwrite" }));

    // "disk full" also lands on the tab's own error slot (the toolbar) via
    // writeTab — scope to the dialog to assert on its own error display.
    const dialog = screen.getByRole("dialog", { name: "Remote file changed" });
    await waitFor(() => {
      expect(within(dialog).getByText("disk full")).toBeTruthy();
    });
    // The dialog must stay open on failure — the user still needs to choose
    // an option, not be left believing the click did nothing.
    expect(screen.getByRole("dialog", { name: "Remote file changed" })).toBeTruthy();
  });

  it("keeps the tab dirty when a keystroke lands while the save is in flight", async () => {
    type WriteResponse = { status: "written" | "conflict"; size: number; modifiedAt: string };
    let openFileListener: OpenFileListener | null = null;
    let resolveWrite: ((value: WriteResponse) => void) | null = null;

    const sftpReadFile = vi.fn().mockResolvedValue({
      content: "hello",
      encoding: "utf-8",
      size: 5,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });
    const sftpWriteFile = vi.fn(
      () =>
        new Promise<WriteResponse>((resolve) => {
          resolveWrite = resolve;
        })
    );

    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile,
      sftpWriteFile,
    });

    const user = userEvent.setup();
    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/original.txt", sftpSessionId: "s1" });
    });
    await screen.findByTestId("editor-pane-stub");

    act(() => {
      ctrlKey("s");
    });
    await waitFor(() => {
      expect(sftpWriteFile).toHaveBeenCalledTimes(1);
    });

    // Typed after the request went out, so this text is not in the payload.
    await user.click(screen.getByRole("button", { name: "simulate keystroke" }));

    await act(async () => {
      resolveWrite?.({ status: "written", size: 5, modifiedAt: "2026-08-13T03:00:00.000Z" });
    });

    // Marking the tab clean here would drop the "unsaved changes" confirm on
    // close and lose the keystroke silently.
    await waitFor(() => {
      expect(screen.getByTitle("Modified")).toBeTruthy();
    });
  });

  it("Mn-6: Escape cancels the dialog, and Ctrl+S is suppressed while it's open", async () => {
    let openFileListener: OpenFileListener | null = null;

    const sftpReadFile = vi.fn().mockResolvedValue({
      content: "hello",
      encoding: "utf-8",
      size: 5,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });
    const sftpWriteFile = vi
      .fn()
      .mockResolvedValueOnce({ status: "conflict", size: 999, modifiedAt: "2026-08-13T01:00:00.000Z" });

    installHypershell({
      onEditorOpenFile: vi.fn((listener: OpenFileListener) => {
        openFileListener = listener;
        return () => {};
      }),
      sftpReadFile,
      sftpWriteFile,
    });

    render(<EditorApp sftpSessionId="s1" />);

    act(() => {
      openFileListener?.({ remotePath: "/r/original.txt", sftpSessionId: "s1" });
    });
    await screen.findByTestId("editor-pane-stub");

    act(() => {
      ctrlKey("s");
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Remote file changed" })).toBeTruthy();
    });
    expect(sftpWriteFile).toHaveBeenCalledTimes(1);

    // The dialog owns the keyboard now — this must not fire a second write.
    act(() => {
      ctrlKey("s");
    });
    expect(sftpWriteFile).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Remote file changed" })).toBeNull();
    });
  });
});
