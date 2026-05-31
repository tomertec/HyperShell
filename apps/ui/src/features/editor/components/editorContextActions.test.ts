import { describe, it, expect, vi } from "vitest";
import { buildEditorContextActions } from "./editorContextActions";

function handlers() {
  return {
    onCut: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onSelectAll: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onFind: vi.fn(),
    onGotoLine: vi.fn(),
    onSave: vi.fn(),
  };
}

const full = {
  hasSelection: true,
  canUndo: true,
  canRedo: true,
  canSave: true,
};

function labels(actions: { label: string; separator?: boolean }[]) {
  return actions.filter((a) => !a.separator).map((a) => a.label);
}

describe("buildEditorContextActions", () => {
  it("includes all editor actions in order", () => {
    const actions = buildEditorContextActions(full, handlers());
    expect(labels(actions)).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select All",
      "Undo",
      "Redo",
      "Find / Replace",
      "Go to Line",
      "Save",
    ]);
  });

  it("disables Cut and Copy when there is no selection", () => {
    const actions = buildEditorContextActions({ ...full, hasSelection: false }, handlers());
    const byLabel = Object.fromEntries(actions.map((a) => [a.label, a]));
    expect(byLabel["Cut"].disabled).toBe(true);
    expect(byLabel["Copy"].disabled).toBe(true);
    expect(byLabel["Paste"].disabled).toBeFalsy();
  });

  it("disables Undo/Redo per canUndo/canRedo", () => {
    const actions = buildEditorContextActions(
      { ...full, canUndo: false, canRedo: false },
      handlers()
    );
    const byLabel = Object.fromEntries(actions.map((a) => [a.label, a]));
    expect(byLabel["Undo"].disabled).toBe(true);
    expect(byLabel["Redo"].disabled).toBe(true);
  });

  it("disables Save when canSave is false", () => {
    const actions = buildEditorContextActions({ ...full, canSave: false }, handlers());
    const byLabel = Object.fromEntries(actions.map((a) => [a.label, a]));
    expect(byLabel["Save"].disabled).toBe(true);
  });

  it("wires each action to its handler", () => {
    const h = handlers();
    const actions = buildEditorContextActions(full, h);
    const byLabel = Object.fromEntries(actions.map((a) => [a.label, a]));
    byLabel["Cut"].action();
    byLabel["Save"].action();
    expect(h.onCut).toHaveBeenCalledOnce();
    expect(h.onSave).toHaveBeenCalledOnce();
  });
});
