/**
 * xterm.js only ships a Unicode 6 width table, which reports width 1 for emoji
 * such as U+2705 (✅) and U+1F680 (🚀). Every program on the other end of the
 * PTY measures those with a modern wcwidth and reserves two columns, so xterm
 * renders the rest of the line one cell to the left — box-drawn tables lose
 * their right border and redraws leave stale glyphs behind.
 *
 * The graphemes addon registers Unicode 15.1 widths plus grapheme clustering.
 * Its version string is baked into the addon, so `terminalUnicode.test.ts`
 * asserts the two still match after an upgrade.
 */
export const TERMINAL_UNICODE_VERSION = "15-graphemes";
