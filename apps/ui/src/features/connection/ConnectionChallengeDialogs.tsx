import { HostKeyVerificationDialog } from "../hosts/HostKeyVerificationDialog";
import { KeyboardInteractiveDialog } from "../hosts/KeyboardInteractiveDialog";
import { TmuxSessionPicker } from "../tmux/TmuxSessionPicker";
import { SftpCredentialsDialog } from "./SftpCredentialsDialog";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

/**
 * Renders whichever connection challenge is currently raised. Mounted once in
 * App — the dialogs read the challenge store instead of App threading a
 * useState pair per dialog field.
 */
export function ConnectionChallengeDialogs() {
  const challenge = useConnectionChallengeStore((s) => s.challenge);
  const busy = useConnectionChallengeStore((s) => s.busy);
  const answer = useConnectionChallengeStore((s) => s.answer);
  const cancel = useConnectionChallengeStore((s) => s.cancel);

  const sftpCredentials = challenge?.kind === "sftp-credentials" ? challenge : null;
  const hostKey = challenge?.kind === "host-key" ? challenge : null;
  const keyboardInteractive = challenge?.kind === "keyboard-interactive" ? challenge : null;
  const tmux = challenge?.kind === "tmux-sessions" ? challenge : null;

  return (
    <>
      <SftpCredentialsDialog
        open={sftpCredentials != null}
        host={sftpCredentials?.host ?? null}
        initialUsername={sftpCredentials?.username ?? ""}
        error={sftpCredentials?.error ?? null}
        submitting={sftpCredentials != null && busy}
        onSubmit={(username, password) => answer({ kind: "sftp-credentials", username, password })}
        onCancel={cancel}
      />

      <HostKeyVerificationDialog
        open={hostKey != null}
        info={hostKey?.info ?? null}
        onTrust={() => answer({ kind: "host-key", trust: true })}
        onReject={cancel}
      />

      <KeyboardInteractiveDialog
        request={keyboardInteractive?.request ?? null}
        onSubmit={(_requestId, responses) => answer({ kind: "keyboard-interactive", responses })}
        onCancel={() => cancel()}
      />

      <TmuxSessionPicker
        open={tmux != null}
        sessions={tmux?.sessions ?? []}
        hostName={tmux?.host.name ?? ""}
        onAttach={(sessionName) => answer({ kind: "tmux-sessions", attachTo: sessionName })}
        onSkip={() => answer({ kind: "tmux-sessions", attachTo: null })}
      />
    </>
  );
}
