import type { KeyboardInteractiveRequest } from "@hypershell/shared";

import { getShell, hasShell } from "../../lib/shell";
import type { HostRecord } from "../hosts/HostsView";
import type { TmuxSessionInfo } from "../tmux/TmuxSessionPicker";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

const challenges = () => useConnectionChallengeStore.getState();

/**
 * Connect SFTP to a host, raising whatever challenges the attempt runs into:
 * an unknown/changed host key, then credentials when the silent attempt fails,
 * then the host key again if it surfaces mid-credential-entry — the chaining
 * the App used to hand-roll across 10 useStates.
 *
 * Resolves with the sftp session id, or `null` when the user cancelled.
 */
export async function connectSftpWithChallenges(host: HostRecord): Promise<string | null> {
  if (!hasShell()) {
    return null;
  }

  let prompting = false;
  let promptUsername = host.username?.trim() ?? "";
  let promptError: string | null = null;

  for (;;) {
    let credentials: { username: string; password?: string } | undefined;
    if (prompting) {
      const answer = await challenges().raise({
        kind: "sftp-credentials",
        host,
        username: promptUsername,
        error: promptError,
      });
      if (!answer) {
        return null;
      }
      promptUsername = answer.username.trim();
      if (!promptUsername) {
        promptError = "Username is required.";
        continue;
      }
      credentials = {
        username: promptUsername,
        ...(answer.password ? { password: answer.password } : {}),
      };
    }

    let response;
    try {
      response = await getShell().sftpConnect({ hostId: host.id, ...credentials });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!prompting) {
        console.warn("[sftp] connect failed, prompting for credentials:", message);
      }
      prompting = true;
      promptError = message;
      continue;
    }

    if ("hostKeyVerification" in response) {
      const info = response.hostKeyVerification;
      const trustAnswer = await challenges().raise({ kind: "host-key", host, info });
      if (!trustAnswer) {
        return null;
      }
      challenges().settle();
      await getShell().hostFingerprintTrust({
        id: `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        hostname: info.hostname,
        port: info.port,
        algorithm: info.algorithm,
        fingerprint: info.fingerprint,
      });
      // Key-based path retries silently; the credential path re-prompts so the
      // user can resubmit their password.
      promptError = null;
      continue;
    }

    challenges().settle();
    return response.sftpSessionId;
  }
}

/**
 * Relay a keyboard-interactive (2FA) request to the user and answer main.
 * Cancel sends one empty string per prompt so the server rejects auth cleanly.
 */
export async function answerKeyboardInteractive(request: KeyboardInteractiveRequest): Promise<void> {
  const answer = await challenges().raise({ kind: "keyboard-interactive", request });
  if (answer) {
    challenges().settle();
  }
  const responses = answer?.responses ?? request.prompts.map(() => "");
  await getShell().keyboardInteractiveRespond({ requestId: request.requestId, responses });
}

/**
 * Ask which detected tmux session to attach to. Resolves `{ attachTo: name }`,
 * `{ attachTo: null }` for a plain connection, or `null` when superseded —
 * then the caller opens nothing.
 */
export async function pickTmuxSession(
  host: HostRecord,
  sessions: TmuxSessionInfo[]
): Promise<{ attachTo: string | null } | null> {
  const answer = await challenges().raise({ kind: "tmux-sessions", host, sessions });
  if (!answer) {
    return null;
  }
  challenges().settle();
  return { attachTo: answer.attachTo };
}
