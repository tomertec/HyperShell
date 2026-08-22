import { create } from "zustand";

import type { HostKeyVerificationInfo, KeyboardInteractiveRequest } from "@hypershell/shared";

import type { HostRecord } from "../hosts/HostsView";
import type { TmuxSessionInfo } from "../tmux/TmuxSessionPicker";

/**
 * "Connecting needs to ask the user something" — one discriminated union
 * instead of four parallel modal state machines in App.tsx.
 */
export type ConnectionChallenge =
  | {
      kind: "sftp-credentials";
      host: HostRecord;
      /** Prefill for the username field (saved host username, or what the user typed last attempt). */
      username: string;
      error: string | null;
    }
  | { kind: "host-key"; host: HostRecord; info: HostKeyVerificationInfo }
  | { kind: "keyboard-interactive"; request: KeyboardInteractiveRequest }
  | { kind: "tmux-sessions"; host: HostRecord; sessions: TmuxSessionInfo[] };

export type ConnectionChallengeAnswer =
  | { kind: "sftp-credentials"; username: string; password: string }
  | { kind: "host-key"; trust: true }
  | { kind: "keyboard-interactive"; responses: string[] }
  | { kind: "tmux-sessions"; attachTo: string | null };

type AnswerFor<K extends ConnectionChallenge["kind"]> = Extract<
  ConnectionChallengeAnswer,
  { kind: K }
>;

interface ConnectionChallengeStore {
  /** The challenge currently on screen, if any. One at a time — a newer raise supersedes. */
  challenge: ConnectionChallenge | null;
  /**
   * True between answer() and the flow's next raise()/settle() — the dialog
   * stays open showing progress (e.g. "Connecting...") while the flow acts on
   * the answer.
   */
  busy: boolean;
  /**
   * Show a challenge and wait for the user. Resolves with the matching answer,
   * or `null` when the challenge was cancelled or superseded by a newer raise —
   * on `null` the store is already cleared, the flow just abandons.
   * After a real answer the flow MUST either raise() again (same dialog stays
   * open — no close/reopen flicker) or settle().
   */
  raise: <K extends ConnectionChallenge["kind"]>(
    challenge: Extract<ConnectionChallenge, { kind: K }>
  ) => Promise<AnswerFor<K> | null>;
  /** Called by the dialog when the user responds. Keeps the dialog open (busy) until the flow settles or re-raises. */
  answer: (answer: ConnectionChallengeAnswer) => void;
  /** Called by the dialog when the user dismisses. Clears the challenge and resolves the pending raise with null. */
  cancel: () => void;
  /** Called by the flow when it is done with the interaction — closes the dialog. */
  settle: () => void;
}

let pendingResolve: ((answer: ConnectionChallengeAnswer | null) => void) | null = null;

export const useConnectionChallengeStore = create<ConnectionChallengeStore>((set) => ({
  challenge: null,
  busy: false,
  raise: <K extends ConnectionChallenge["kind"]>(
    challenge: Extract<ConnectionChallenge, { kind: K }>
  ) => {
    pendingResolve?.(null);
    set({ challenge, busy: false });
    return new Promise<AnswerFor<K> | null>((resolve) => {
      pendingResolve = resolve as (answer: ConnectionChallengeAnswer | null) => void;
    });
  },
  answer: (answer) => {
    const resolve = pendingResolve;
    pendingResolve = null;
    set({ busy: true });
    resolve?.(answer);
  },
  cancel: () => {
    const resolve = pendingResolve;
    pendingResolve = null;
    set({ challenge: null, busy: false });
    resolve?.(null);
  },
  settle: () => {
    // Defensive: settling an unanswered challenge cancels it, so the flow's
    // pending raise can never hang.
    const resolve = pendingResolve;
    pendingResolve = null;
    set({ challenge: null, busy: false });
    resolve?.(null);
  },
}));
