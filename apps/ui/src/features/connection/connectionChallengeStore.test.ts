import { afterEach, describe, expect, it } from "vitest";

import type { HostRecord } from "../hosts/HostsView";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

const host = { id: "h1", name: "web", hostname: "web.example", port: 22 } as HostRecord;

const store = () => useConnectionChallengeStore.getState();

afterEach(() => {
  // Resolve any dangling raise and reset state between tests.
  store().settle();
});

describe("connectionChallengeStore", () => {
  it("raise shows the challenge and answer resolves it, keeping the dialog open as busy", async () => {
    const pending = store().raise({ kind: "sftp-credentials", host, username: "root", error: null });
    expect(store().challenge).toEqual({ kind: "sftp-credentials", host, username: "root", error: null });
    expect(store().busy).toBe(false);

    store().answer({ kind: "sftp-credentials", username: "root", password: "pw" });
    await expect(pending).resolves.toEqual({ kind: "sftp-credentials", username: "root", password: "pw" });
    // The flow decides what happens next — until then the dialog shows progress.
    expect(store().challenge).not.toBeNull();
    expect(store().busy).toBe(true);

    store().settle();
    expect(store().challenge).toBeNull();
    expect(store().busy).toBe(false);
  });

  it("cancel resolves the raise with null and clears the challenge", async () => {
    const pending = store().raise({ kind: "tmux-sessions", host, sessions: [] });
    store().cancel();
    await expect(pending).resolves.toBeNull();
    expect(store().challenge).toBeNull();
    expect(store().busy).toBe(false);
  });

  it("a newer raise supersedes a pending one, resolving it with null", async () => {
    const first = store().raise({ kind: "tmux-sessions", host, sessions: [] });
    const second = store().raise({ kind: "host-key", host, info: {
      hostname: "web.example", port: 22, algorithm: "ssh-ed25519",
      fingerprint: "SHA256:abc", verificationStatus: "new_host",
    }});

    await expect(first).resolves.toBeNull();
    expect(store().challenge?.kind).toBe("host-key");

    store().answer({ kind: "host-key", trust: true });
    await expect(second).resolves.toEqual({ kind: "host-key", trust: true });
  });

  it("re-raising after an answer replaces the challenge without closing it", async () => {
    const first = store().raise({ kind: "sftp-credentials", host, username: "root", error: null });
    store().answer({ kind: "sftp-credentials", username: "root", password: "wrong" });
    await first;
    expect(store().busy).toBe(true);

    void store().raise({ kind: "sftp-credentials", host, username: "root", error: "Auth failed" });
    const challenge = store().challenge;
    expect(challenge?.kind === "sftp-credentials" && challenge.error).toBe("Auth failed");
    expect(store().busy).toBe(false);
  });

  it("settle cancels an unanswered challenge so a flow's raise can never hang", async () => {
    const pending = store().raise({ kind: "tmux-sessions", host, sessions: [] });
    store().settle();
    await expect(pending).resolves.toBeNull();
    expect(store().challenge).toBeNull();
  });
});
