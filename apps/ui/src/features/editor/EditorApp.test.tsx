import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditorApp } from "./EditorApp";

// EditorPane pulls in CodeMirror, which isn't what these tests exercise —
// they cover EditorApp's own save-conflict orchestration. Stub it out so
// mounting a non-readOnly tab doesn't require a real editor surface.
vi.mock("./components/EditorPane", () => ({
  EditorPane: () => <div data-testid="editor-pane-stub" />,
}));

type Hypershell = NonNullable<Window["hypershell"]>;
type OpenFileListener = (event: { remotePath: string; sftpSessionId: string }) => void;

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
    window.hypershell = mockHypershell({
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

    window.hypershell = mockHypershell({
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

    window.hypershell = mockHypershell({
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
