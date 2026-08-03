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
 * - Unknown shells (fish, csh, restricted) will emit syntax errors; they are
 *   silently skipped by the [ -n "${...VERSION}" ] guards and do not match.
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

export function buildShellIntegrationBootstrap(): string {
  return ` ${BOOTSTRAP}\r`;
}
