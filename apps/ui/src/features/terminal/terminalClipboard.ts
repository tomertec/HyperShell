export type TerminalClipboardAction = "copy" | "paste" | null;

export interface TerminalClipboardKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface TerminalClipboardShortcutInput {
  event: TerminalClipboardKeyEvent;
  hasSelection: boolean;
  isMacLike: boolean;
}

export interface TerminalRightClickInput {
  hasSelection: boolean;
  /** True while the remote app has requested mouse reporting (vim, tmux, htop). */
  mouseTrackingActive: boolean;
}

/**
 * Right-click clipboard behaviour, matching Windows Terminal / conhost QuickEdit:
 * a live selection copies, anything else pastes. Yields to the remote app when it
 * has the mouse — it already received the click.
 */
export function getTerminalRightClickAction(
  input: TerminalRightClickInput
): TerminalClipboardAction {
  if (input.mouseTrackingActive) {
    return null;
  }
  return input.hasSelection ? "copy" : "paste";
}

export function getTerminalClipboardAction(
  input: TerminalClipboardShortcutInput
): TerminalClipboardAction {
  const { event, hasSelection, isMacLike } = input;
  if (event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();

  // Linux/Windows terminal conventions
  if (!isMacLike && event.ctrlKey && event.shiftKey && !event.metaKey) {
    if (key === "c") {
      return "copy";
    }
    if (key === "v") {
      return "paste";
    }
  }

  // Insert-key conventions
  if (!event.ctrlKey && !event.metaKey && event.shiftKey && key === "insert") {
    return "paste";
  }
  if (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "insert") {
    return "copy";
  }

  // Primary system shortcuts:
  // - macOS: Cmd+C / Cmd+V
  // - Linux/Windows: Ctrl+C (copy only when selection exists), Ctrl+V
  if (isMacLike) {
    if (event.metaKey && !event.ctrlKey && !event.shiftKey) {
      if (key === "c") {
        return "copy";
      }
      if (key === "v") {
        return "paste";
      }
    }
    return null;
  }

  if (event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (key === "v") {
      return "paste";
    }
    if (key === "c" && hasSelection) {
      return "copy";
    }
  }

  return null;
}
