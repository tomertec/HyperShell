import type { ContextMenuAction } from "../../../components/ContextMenu";

export interface EditorContextSnapshot {
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
}

export interface EditorContextHandlers {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFind: () => void;
  onGotoLine: () => void;
  onSave: () => void;
}

const separator: ContextMenuAction = { separator: true, label: "", action: () => {} };

export function buildEditorContextActions(
  snapshot: EditorContextSnapshot,
  handlers: EditorContextHandlers
): ContextMenuAction[] {
  return [
    { label: "Cut", shortcut: "Ctrl+X", action: handlers.onCut, disabled: !snapshot.hasSelection },
    { label: "Copy", shortcut: "Ctrl+C", action: handlers.onCopy, disabled: !snapshot.hasSelection },
    { label: "Paste", shortcut: "Ctrl+V", action: handlers.onPaste },
    separator,
    { label: "Select All", shortcut: "Ctrl+A", action: handlers.onSelectAll },
    separator,
    { label: "Undo", shortcut: "Ctrl+Z", action: handlers.onUndo, disabled: !snapshot.canUndo },
    { label: "Redo", shortcut: "Ctrl+Y", action: handlers.onRedo, disabled: !snapshot.canRedo },
    separator,
    { label: "Find / Replace", shortcut: "Ctrl+F", action: handlers.onFind },
    { label: "Go to Line", action: handlers.onGotoLine },
    separator,
    { label: "Save", shortcut: "Ctrl+S", action: handlers.onSave, disabled: !snapshot.canSave },
  ];
}
