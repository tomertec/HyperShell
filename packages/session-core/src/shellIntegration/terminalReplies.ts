/**
 * Tells a terminal's own answers apart from something the user typed.
 *
 * This matters because both injection paths — the SSH shell-integration
 * bootstrap and a local shell's startup command — give up the moment input
 * arrives, on the reasoning that the user's text is already sitting in the
 * shell's line buffer and anything typed after it would merge into one broken
 * command. But not everything arriving on that channel came from a person.
 * A terminal answers questions on its own: ConPTY turns on focus reporting
 * (`ESC[?1004h`) for every local shell, so xterm.js reports `ESC[O` the instant
 * the window loses focus — exactly what happens when the user clicks a dialog
 * button or switches to another app while the shell is starting. Treating that
 * as typing cancelled the injection before it ever ran.
 *
 * The list is deliberately an allowlist of replies a terminal emits by itself.
 * Anything else — including arrow keys, which share the CSI prefix — counts as
 * the user, because a wrong guess in that direction corrupts their command
 * line, while a wrong guess the other way only costs an injection.
 */
/* eslint-disable no-control-regex -- matching the terminal's own control bytes is the purpose */
const AUTOMATIC_REPLIES: RegExp[] = [
  // Focus in / focus out (DECSET 1004).
  /^\[[IO]/,
  // Cursor position report (DSR 6): ESC [ row ; col R
  /^\[\d+;\d+R/,
  // Primary / secondary device attributes: ESC [ ? … c and ESC [ > … c
  /^\[[?>][0-9;]*c/,
  // Device status report (DSR 5): ESC [ 0 n
  /^\[[0-9;]*n/,
  // DCS-delimited answers such as XTVERSION: ESC P … ESC \
  /^P[\s\S]*?\\/,
  // OSC answers to colour/title queries: ESC ] … BEL, or ESC ] … ESC \
  /^\][\s\S]*?(?:|\\)/,
];
/* eslint-enable no-control-regex */

/**
 * True when every byte of `data` is a reply the terminal produced by itself,
 * so none of it is waiting in the shell's line buffer. An empty write says
 * nothing about the user either way, so it counts as a reply.
 */
export function isAutomaticTerminalReply(data: string): boolean {
  let rest = data;

  while (rest.length > 0) {
    const pattern = AUTOMATIC_REPLIES.find((candidate) => candidate.test(rest));
    if (!pattern) {
      return false;
    }

    rest = rest.replace(pattern, "");
  }

  return true;
}
