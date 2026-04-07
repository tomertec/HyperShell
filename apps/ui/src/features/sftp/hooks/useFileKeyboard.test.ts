import { describe, expect, it, vi } from "vitest";

import { handleFileKeyDown, type FileKeyboardContext } from "./useFileKeyboard";

function makeContext(overrides: Partial<FileKeyboardContext> = {}): FileKeyboardContext {
  return {
    entries: [
      { name: "docs", path: "/docs", size: 0, modifiedAt: "", isDirectory: true },
      { name: "src", path: "/src", size: 0, modifiedAt: "", isDirectory: true },
      { name: "file.ts", path: "/file.ts", size: 100, modifiedAt: "", isDirectory: false },
      { name: "readme.md", path: "/readme.md", size: 50, modifiedAt: "", isDirectory: false }
    ],
    cursorIndex: 0,
    selection: new Set<string>(),
    setCursorIndex: vi.fn(),
    setSelection: vi.fn(),
    onNavigate: vi.fn(),
    onGoUp: vi.fn(),
    onEdit: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onMkdir: vi.fn(),
    onTransfer: vi.fn(),
    onRefresh: vi.fn(),
    onFocusFilter: vi.fn(),
    onFocusBreadcrumb: vi.fn(),
    onSwitchPane: vi.fn(),
    onSelectAll: vi.fn(),
    ...overrides
  };
}

function fakeKey(key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    metaKey: mods.metaKey ?? false,
  } as unknown as KeyboardEvent;
}

describe("handleFileKeyDown", () => {
  it("moves cursor down with ArrowDown", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor down with j", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("j"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor up with ArrowUp", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    const handled = handleFileKeyDown(fakeKey("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("moves cursor up with k", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    const handled = handleFileKeyDown(fakeKey("k"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
  });

  it("does not go below last entry", () => {
    const ctx = makeContext({ cursorIndex: 3 });
    const handled = handleFileKeyDown(fakeKey("ArrowDown"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3);
  });

  it("does not go above first entry", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    const handled = handleFileKeyDown(fakeKey("ArrowUp"), ctx);
    expect(handled).toBe(true);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(0);
  });

  it("navigates into directory on Enter", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("Enter"), ctx);
    expect(ctx.onNavigate).toHaveBeenCalledWith("/docs");
  });

  it("edits file on Enter", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("Enter"), ctx);
    expect(ctx.onEdit).toHaveBeenCalledWith("/file.ts");
  });

  it("goes up on Backspace", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("Backspace"), ctx);
    expect(ctx.onGoUp).toHaveBeenCalled();
  });

  it("jumps to first on Home", () => {
    const ctx = makeContext({ cursorIndex: 3 });
    handleFileKeyDown(fakeKey("Home"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(0);
  });

  it("jumps to last on End", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("End"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3);
  });

  it("toggles selection on Space", () => {
    const ctx = makeContext({ cursorIndex: 1 });
    handleFileKeyDown(fakeKey(" "), ctx);
    expect(ctx.setSelection).toHaveBeenCalled();
    const newSelection = (ctx.setSelection as ReturnType<typeof vi.fn>).mock.calls[0][0] as Set<string>;
    expect(newSelection.has("/src")).toBe(true);
  });

  it("switches pane on Tab", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("Tab"), ctx);
    expect(ctx.onSwitchPane).toHaveBeenCalled();
  });

  it("renames on F2", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("F2"), ctx);
    expect(ctx.onRename).toHaveBeenCalledWith("/docs");
  });

  it("transfers on F5", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("F5"), ctx);
    expect(ctx.onTransfer).toHaveBeenCalled();
  });

  it("creates folder on F7", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("F7"), ctx);
    expect(ctx.onMkdir).toHaveBeenCalled();
  });

  it("deletes on F8", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("F8"), ctx);
    expect(ctx.onDelete).toHaveBeenCalled();
  });

  it("deletes on Delete key", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("Delete"), ctx);
    expect(ctx.onDelete).toHaveBeenCalled();
  });

  it("refreshes on Ctrl+R", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("r", { ctrlKey: true }), ctx);
    expect(ctx.onRefresh).toHaveBeenCalled();
  });

  it("focuses filter on Ctrl+F", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("f", { ctrlKey: true }), ctx);
    expect(ctx.onFocusFilter).toHaveBeenCalled();
  });

  it("focuses breadcrumb on Ctrl+L", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("l", { ctrlKey: true }), ctx);
    expect(ctx.onFocusBreadcrumb).toHaveBeenCalled();
  });

  it("selects all on Ctrl+A", () => {
    const ctx = makeContext();
    handleFileKeyDown(fakeKey("a", { ctrlKey: true }), ctx);
    expect(ctx.onSelectAll).toHaveBeenCalled();
  });

  it("extends selection up with Shift+ArrowUp", () => {
    const ctx = makeContext({ cursorIndex: 2 });
    handleFileKeyDown(fakeKey("ArrowUp", { shiftKey: true }), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(1);
    expect(ctx.setSelection).toHaveBeenCalled();
  });

  it("jumps 20 rows on PageDown", () => {
    const ctx = makeContext({ cursorIndex: 0 });
    handleFileKeyDown(fakeKey("PageDown"), ctx);
    expect(ctx.setCursorIndex).toHaveBeenCalledWith(3); // clamped to last entry
  });

  it("returns false for unhandled keys", () => {
    const ctx = makeContext();
    const handled = handleFileKeyDown(fakeKey("x"), ctx);
    expect(handled).toBe(false);
  });
});
