/**
 * One line of shell that teaches a remote bash or zsh to report the command it
 * is about to run as an OSC 0 title, and to restore `user@host: cwd` when the
 * prompt comes back. HyperShell writes this into an SSH session right after it
 * connects, which is why every constraint below matters:
 *
 * - It must be ONE line. The pty sees it as typed input; a newline would run
 *   half a statement.
 * - It starts with a space so a remote with HISTCONTROL=ignorespace|ignoreboth
 *   (the Debian/Ubuntu default) keeps it out of shell history.
 * - It is guarded by __HS_SI so reconnects and manual re-runs are no-ops.
 * - It appends to PROMPT_COMMAND and refuses to install at all if the user
 *   already has a DEBUG trap — clobbering someone's prompt is worse than
 *   showing a stale tab title.
 * - POSIX-compatible shells that are neither bash nor zsh simply match neither
 *   `VERSION` guard and install nothing; fish and csh will emit a syntax error,
 *   since this line is not valid syntax for them.
 * - It ends with a printf that erases its own echo: by the time the shell runs
 *   the line, the remote tty has already echoed all of it at the prompt, so
 *   the first output the command produces is "cursor up N rows, column 0,
 *   erase to end of screen" — the snippet vanishes and the next prompt draws
 *   where it stood. N comes from the pty width known at injection time; it is
 *   biased high because the prompt length is unknowable from here, and eating
 *   a row of MOTD beats leaving fragments of shell code on screen.
 */
const BOOTSTRAP = [
  'if [ -z "${__HS_SI:-}" ]; then',
  '__HS_SI=1;',
  'if [ -n "${ZSH_VERSION:-}" ]; then',
  'autoload -Uz add-zsh-hook;',
  `__hs_pre() { printf '\\033]0;%s\\007' "\${1%% *}"; };`,
  `__hs_post() { printf '\\033]0;%s@%s: %s\\007' "\${USER}" "\${HOST%%.*}" "\${PWD/#$HOME/~}"; };`,
  'add-zsh-hook preexec __hs_pre;',
  'add-zsh-hook precmd __hs_post;',
  'elif [ -n "${BASH_VERSION:-}" ] && [ -z "$(trap -p DEBUG)" ]; then',
  `__hs_pre() { case "$BASH_COMMAND" in __hs_post*) return;; esac; printf '\\033]0;%s\\007' "\${BASH_COMMAND%% *}"; };`,
  `__hs_post() { printf '\\033]0;%s@%s: %s\\007' "\${USER}" "\${HOSTNAME%%.*}" "\${PWD/#$HOME/~}"; };`,
  "trap '__hs_pre' DEBUG;",
  'PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND;}__hs_post";',
  'fi;',
  'fi'
].join(" ");

// eslint-disable-next-line no-control-regex -- stripping terminal escapes is the purpose of this pattern
const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// eslint-disable-next-line no-control-regex -- stripping terminal escapes is the purpose of this pattern
const CSI_SEQUENCE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex -- stripping terminal escapes is the purpose of this pattern
const SIMPLE_ESCAPE = /\x1b[@-Z\\-_]/g;

/**
 * True when the tail of a session's output looks like a shell sitting at a
 * prompt: after stripping escape sequences, the last visible output does not
 * end with a newline. MOTD lines and banners end with one; prompts never do.
 * This is what makes the injection single-echo: writing before the prompt
 * lands the line in the login tty (canonical echo) AND in the line editor's
 * redraw — two copies, and the self-erase only measures one.
 */
export function looksLikePrompt(tail: string): boolean {
  const visible = tail
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .replace(SIMPLE_ESCAPE, "")
    // eslint-disable-next-line no-control-regex -- stripping terminal escapes is the purpose of this pattern
    .replace(/\x07/g, "")
    .replace(/[ \t]+$/, "");
  if (visible.length === 0) {
    return false;
  }
  return !visible.endsWith("\n") && !visible.endsWith("\r");
}

/**
 * Emitted by the probe when a real shell executes it. Contains raw control
 * bytes (ESC, BEL) that can only come from printf running — the probe's own
 * echo shows the literal text `\033]777;...` (backslashes, not control
 * characters), so watching for these bytes cannot false-positive on echo.
 * OSC 777 with an unknown payload is ignored by xterm.js: nothing renders.
 */
export const SHELL_INTEGRATION_PROBE_MARKER = "\u001b]777;hs-probe\u0007";

/**
 * A one-row, self-erasing handshake typed before the real bootstrap. Injection
 * is typing into a tty whose reader we cannot know: mid-init the line lands in
 * the login tty's canonical buffer AND the line editor's redraw (two echoes),
 * or feeds an interactive question like oh-my-zsh's "update? [Y/n]" — and no
 * quiet-window or prompt-shape heuristic can tell those apart from a real
 * prompt. So the big line is only written after this probe's marker bytes come
 * back, which proves a shell is executing typed lines at a prompt. The
 * trailing printf erases the probe's own echoed row (up 2 covers a wrapped
 * echo; one row of over-erase beats leaving the probe visible).
 */
export function buildShellIntegrationProbe(): string {
  return " printf '\\033]777;hs-probe\\007\\033[2A\\r\\033[J'\r";
}

const DEFAULT_COLS = 80;

/** Widths this small are tty glitches, not real terminals — don't divide by them. */
const MIN_PLAUSIBLE_COLS = 10;

/** Upper bound keeps the row count two digits, which the length estimate assumes. */
const MAX_ERASE_ROWS = 99;

function eraseSuffix(rows: number): string {
  return `; printf '\\033[${rows}A\\r\\033[J'`;
}

export function buildShellIntegrationBootstrap(cols = DEFAULT_COLS): string {
  const effectiveCols = cols >= MIN_PLAUSIBLE_COLS ? cols : DEFAULT_COLS;
  // Echoed characters: leading space + body + the suffix itself (estimated at
  // its widest, two row digits). +2 rows absorbs any prompt length: the echo
  // spans at most floor(length/cols) + 2 rows however far the prompt pushed it.
  const echoedLength = 1 + BOOTSTRAP.length + eraseSuffix(MAX_ERASE_ROWS).length;
  const rows = Math.min(
    MAX_ERASE_ROWS,
    Math.floor(echoedLength / effectiveCols) + 2
  );
  return ` ${BOOTSTRAP}${eraseSuffix(rows)}\r`;
}
