import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeShell } from "../../lib/fakeShell";
import { setShell } from "../../lib/shell";
import type { HostRecord } from "../hosts/HostsView";
import {
  answerKeyboardInteractive,
  connectSftpWithChallenges,
  pickTmuxSession,
} from "./connectionChallengeFlows";
import { useConnectionChallengeStore } from "./connectionChallengeStore";

const host = {
  id: "h1",
  name: "web",
  hostname: "web.example",
  port: 22,
  username: "saved-user",
} as HostRecord;

const hostKeyInfo = {
  hostname: "web.example",
  port: 22,
  algorithm: "ssh-ed25519",
  fingerprint: "SHA256:abc",
  verificationStatus: "new_host" as const,
};

const store = () => useConnectionChallengeStore.getState();

/** Waits until the flow has raised a challenge of the given kind. */
async function challengeRaised(kind: string) {
  await vi.waitFor(() => {
    expect(store().challenge?.kind).toBe(kind);
  });
  return store().challenge!;
}

afterEach(() => {
  store().settle();
  setShell(null);
  vi.restoreAllMocks();
});

describe("connectSftpWithChallenges", () => {
  it("resolves the session id directly when the silent connect succeeds", async () => {
    const { shell } = createFakeShell({
      sftpConnect: vi.fn().mockResolvedValue({ sftpSessionId: "sftp-1" }),
    });
    setShell(shell);

    await expect(connectSftpWithChallenges(host)).resolves.toBe("sftp-1");
    expect(store().challenge).toBeNull();
  });

  it("raises a host-key challenge from the structured response, trusts, and retries", async () => {
    const sftpConnect = vi
      .fn()
      .mockResolvedValueOnce({ hostKeyVerification: hostKeyInfo })
      .mockResolvedValueOnce({ sftpSessionId: "sftp-2" });
    const hostFingerprintTrust = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ sftpConnect, hostFingerprintTrust });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    const challenge = await challengeRaised("host-key");
    expect(challenge.kind === "host-key" && challenge.info).toEqual(hostKeyInfo);

    store().answer({ kind: "host-key", trust: true });
    await expect(result).resolves.toBe("sftp-2");

    expect(hostFingerprintTrust).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "web.example",
        port: 22,
        algorithm: "ssh-ed25519",
        fingerprint: "SHA256:abc",
      })
    );
    expect(sftpConnect).toHaveBeenCalledTimes(2);
  });

  it("returns null without trusting when the host-key challenge is rejected", async () => {
    const hostFingerprintTrust = vi.fn();
    const { shell } = createFakeShell({
      sftpConnect: vi.fn().mockResolvedValue({ hostKeyVerification: hostKeyInfo }),
      hostFingerprintTrust,
    });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    await challengeRaised("host-key");
    store().cancel();

    await expect(result).resolves.toBeNull();
    expect(hostFingerprintTrust).not.toHaveBeenCalled();
  });

  it("prompts for credentials when the silent connect fails, then connects with them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sftpConnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("All authentication methods failed"))
      .mockResolvedValueOnce({ sftpSessionId: "sftp-3" });
    const { shell } = createFakeShell({ sftpConnect });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    const challenge = await challengeRaised("sftp-credentials");
    // Prefilled from the host record, error carries the failure.
    expect(challenge.kind === "sftp-credentials" && challenge.username).toBe("saved-user");
    expect(challenge.kind === "sftp-credentials" && challenge.error).toMatch(/authentication/);

    store().answer({ kind: "sftp-credentials", username: "root", password: "pw" });
    await expect(result).resolves.toBe("sftp-3");
    expect(sftpConnect).toHaveBeenLastCalledWith({ hostId: "h1", username: "root", password: "pw" });
  });

  it("re-raises the credentials prompt with the error when the submitted credentials fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sftpConnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValueOnce(new Error("bad password"))
      .mockResolvedValueOnce({ sftpSessionId: "sftp-4" });
    const { shell } = createFakeShell({ sftpConnect });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    await challengeRaised("sftp-credentials");
    store().answer({ kind: "sftp-credentials", username: "root", password: "wrong" });

    await vi.waitFor(() => {
      const challenge = store().challenge;
      expect(challenge?.kind === "sftp-credentials" && challenge.error).toBe("bad password");
    });
    // What the user typed last time is the new prefill.
    const challenge = store().challenge;
    expect(challenge?.kind === "sftp-credentials" && challenge.username).toBe("root");

    store().answer({ kind: "sftp-credentials", username: "root", password: "right" });
    await expect(result).resolves.toBe("sftp-4");
  });

  it("re-raises with a validation error when the username is empty", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sftpConnect = vi.fn().mockRejectedValueOnce(new Error("nope"));
    const { shell } = createFakeShell({ sftpConnect });
    setShell(shell);

    const result = connectSftpWithChallenges({ ...host, username: "" });
    await challengeRaised("sftp-credentials");
    store().answer({ kind: "sftp-credentials", username: "  ", password: "pw" });

    await vi.waitFor(() => {
      const challenge = store().challenge;
      expect(challenge?.kind === "sftp-credentials" && challenge.error).toBe("Username is required.");
    });
    // No second connect attempt was made for the empty username.
    expect(sftpConnect).toHaveBeenCalledTimes(1);

    store().cancel();
    await expect(result).resolves.toBeNull();
  });

  it("chains host-key verification out of a credential attempt back into the prompt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sftpConnect = vi
      .fn()
      .mockRejectedValueOnce(new Error("auth failed"))
      .mockResolvedValueOnce({ hostKeyVerification: hostKeyInfo })
      .mockResolvedValueOnce({ sftpSessionId: "sftp-5" });
    const hostFingerprintTrust = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ sftpConnect, hostFingerprintTrust });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    await challengeRaised("sftp-credentials");
    store().answer({ kind: "sftp-credentials", username: "root", password: "pw" });

    await challengeRaised("host-key");
    store().answer({ kind: "host-key", trust: true });

    // After trusting, the user is re-prompted (not silently retried) so they
    // can resubmit their password.
    const challenge = await challengeRaised("sftp-credentials");
    expect(challenge.kind === "sftp-credentials" && challenge.username).toBe("root");
    expect(challenge.kind === "sftp-credentials" && challenge.error).toBeNull();
    store().answer({ kind: "sftp-credentials", username: "root", password: "pw" });

    await expect(result).resolves.toBe("sftp-5");
    expect(hostFingerprintTrust).toHaveBeenCalledTimes(1);
  });

  it("returns null when the credentials prompt is cancelled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { shell } = createFakeShell({
      sftpConnect: vi.fn().mockRejectedValue(new Error("nope")),
    });
    setShell(shell);

    const result = connectSftpWithChallenges(host);
    await challengeRaised("sftp-credentials");
    store().cancel();

    await expect(result).resolves.toBeNull();
  });
});

describe("answerKeyboardInteractive", () => {
  const request = {
    requestId: "kbd-1",
    name: "2FA",
    instructions: "",
    prompts: [
      { prompt: "Code:", echo: false },
      { prompt: "Backup:", echo: false },
    ],
  };

  it("relays the user's responses", async () => {
    const keyboardInteractiveRespond = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ keyboardInteractiveRespond });
    setShell(shell);

    const flow = answerKeyboardInteractive(request);
    await challengeRaised("keyboard-interactive");
    store().answer({ kind: "keyboard-interactive", responses: ["123456", "789"] });
    await flow;

    expect(keyboardInteractiveRespond).toHaveBeenCalledWith({
      requestId: "kbd-1",
      responses: ["123456", "789"],
    });
    expect(store().challenge).toBeNull();
  });

  it("sends one empty response per prompt on cancel so auth fails cleanly", async () => {
    const keyboardInteractiveRespond = vi.fn().mockResolvedValue(undefined);
    const { shell } = createFakeShell({ keyboardInteractiveRespond });
    setShell(shell);

    const flow = answerKeyboardInteractive(request);
    await challengeRaised("keyboard-interactive");
    store().cancel();
    await flow;

    expect(keyboardInteractiveRespond).toHaveBeenCalledWith({
      requestId: "kbd-1",
      responses: ["", ""],
    });
  });
});

describe("pickTmuxSession", () => {
  const sessions = [{ name: "main", windowCount: 2, createdAt: "2026-01-01T00:00:00Z", attached: false }];

  it("resolves the chosen session name", async () => {
    setShell(createFakeShell().shell);
    const flow = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().answer({ kind: "tmux-sessions", attachTo: "main" });
    await expect(flow).resolves.toEqual({ attachTo: "main" });
  });

  it("resolves attachTo null on skip and null when superseded", async () => {
    setShell(createFakeShell().shell);
    const skipped = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().answer({ kind: "tmux-sessions", attachTo: null });
    await expect(skipped).resolves.toEqual({ attachTo: null });

    const superseded = pickTmuxSession(host, sessions);
    await challengeRaised("tmux-sessions");
    store().cancel();
    await expect(superseded).resolves.toBeNull();
  });
});
