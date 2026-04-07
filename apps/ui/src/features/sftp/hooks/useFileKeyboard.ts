export interface FileKeyboardEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FileKeyboardContext {
  entries: FileKeyboardEntry[];
  cursorIndex: number;
  selection: Set<string>;
  setCursorIndex: (index: number) => void;
  setSelection: (selection: Set<string>) => void;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onEdit: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (paths: string[]) => void;
  onMkdir: () => void;
  onTransfer: (paths: string[]) => void;
  onRefresh: () => void;
  onFocusFilter: () => void;
  onFocusBreadcrumb: () => void;
  onSwitchPane: () => void;
  onSelectAll: () => void;
}

const PAGE_SIZE = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getEffectivePaths(ctx: FileKeyboardContext): string[] {
  if (ctx.selection.size > 0) {
    return Array.from(ctx.selection);
  }
  const entry = ctx.entries[ctx.cursorIndex];
  return entry ? [entry.path] : [];
}

export function handleFileKeyDown(
  event: KeyboardEvent,
  ctx: FileKeyboardContext
): boolean {
  const { key, ctrlKey, metaKey, shiftKey } = event;
  const mod = ctrlKey || metaKey;
  const maxIndex = ctx.entries.length - 1;

  // Ctrl/Cmd combos
  if (mod) {
    switch (key.toLowerCase()) {
      case "a":
        ctx.onSelectAll();
        return true;
      case "f":
        ctx.onFocusFilter();
        return true;
      case "r":
        ctx.onRefresh();
        return true;
      case "l":
        ctx.onFocusBreadcrumb();
        return true;
      default:
        return false;
    }
  }

  // Navigation with optional shift-extend
  if (key === "ArrowDown" || key === "j") {
    const next = clamp(ctx.cursorIndex + 1, 0, maxIndex);
    ctx.setCursorIndex(next);
    if (shiftKey) {
      const sel = new Set(ctx.selection);
      const entry = ctx.entries[next];
      if (entry) sel.add(entry.path);
      ctx.setSelection(sel);
    }
    return true;
  }

  if (key === "ArrowUp" || key === "k") {
    const next = clamp(ctx.cursorIndex - 1, 0, maxIndex);
    ctx.setCursorIndex(next);
    if (shiftKey) {
      const sel = new Set(ctx.selection);
      const entry = ctx.entries[next];
      if (entry) sel.add(entry.path);
      ctx.setSelection(sel);
    }
    return true;
  }

  switch (key) {
    case "Enter": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (!entry) return true;
      if (entry.isDirectory) {
        ctx.onNavigate(entry.path);
      } else {
        ctx.onEdit(entry.path);
      }
      return true;
    }

    case "Backspace":
      ctx.onGoUp();
      return true;

    case "Home":
      ctx.setCursorIndex(0);
      return true;

    case "End":
      ctx.setCursorIndex(maxIndex);
      return true;

    case "PageDown":
      ctx.setCursorIndex(clamp(ctx.cursorIndex + PAGE_SIZE, 0, maxIndex));
      return true;

    case "PageUp":
      ctx.setCursorIndex(clamp(ctx.cursorIndex - PAGE_SIZE, 0, maxIndex));
      return true;

    case " ": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (!entry) return true;
      const sel = new Set(ctx.selection);
      if (sel.has(entry.path)) {
        sel.delete(entry.path);
      } else {
        sel.add(entry.path);
      }
      ctx.setSelection(sel);
      return true;
    }

    case "Tab":
      ctx.onSwitchPane();
      return true;

    case "F2": {
      const entry = ctx.entries[ctx.cursorIndex];
      if (entry) ctx.onRename(entry.path);
      return true;
    }

    case "F5":
    case "F6":
      ctx.onTransfer(getEffectivePaths(ctx));
      return true;

    case "F7":
      ctx.onMkdir();
      return true;

    case "F8":
    case "Delete":
      ctx.onDelete(getEffectivePaths(ctx));
      return true;

    case "Escape":
      ctx.setSelection(new Set());
      return true;

    default:
      return false;
  }
}
