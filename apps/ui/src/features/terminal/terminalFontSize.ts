import {
  normalizeTerminalFontSize,
  TERMINAL_FONT_SIZE_STEP,
} from "../settings/settingsStore";

export type TerminalFontSizeAction = "increase" | "decrease" | "reset" | null;
export type TerminalFontSizeChangeAction = Exclude<TerminalFontSizeAction, null>;

export interface TerminalFontSizeKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface TerminalFontSizeShortcutInput {
  event: TerminalFontSizeKeyEvent;
  isMacLike: boolean;
}

export function getTerminalFontSizeAction(
  input: TerminalFontSizeShortcutInput
): TerminalFontSizeAction {
  const { event, isMacLike } = input;
  if (event.altKey) {
    return null;
  }

  const primaryModifierPressed = isMacLike
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!primaryModifierPressed) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "=" || key === "+" || key === "add" || key === "numpadadd") {
    return "increase";
  }

  if (key === "-" || key === "_" || key === "subtract" || key === "numpadsubtract") {
    return "decrease";
  }

  if (key === "0" || key === ")" || key === "numpad0") {
    return "reset";
  }

  return null;
}

export function getNextTerminalFontSize(
  action: TerminalFontSizeChangeAction,
  currentFontSize: number,
  defaultFontSize: number
): number {
  if (action === "reset") {
    return normalizeTerminalFontSize(defaultFontSize);
  }

  const delta = action === "increase" ? TERMINAL_FONT_SIZE_STEP : -TERMINAL_FONT_SIZE_STEP;
  return normalizeTerminalFontSize(currentFontSize + delta);
}
