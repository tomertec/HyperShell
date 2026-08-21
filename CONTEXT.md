# Domain language

Terms this codebase uses with a specific meaning. Add a term when it appears in
two or more places, or when a module is named after it.

## Profile id

The string a session is opened with. Not always a host id — it may be a host
record's id, its name, its hostname, or a `user@hostname` destination typed into
Quick Connect. Resolving one to a host record is [Credential
resolution](#credential-resolution)'s job, not each caller's.

## Credential resolution

Turning a [profile id](#profile-id) into the host record and secret needed to
authenticate: the host lookup, the saved password in secure storage (DPAPI), and
any `op://` 1Password reference.

Owned by `apps/desktop/src/main/connection/credentialResolver.ts` and shared by
the SSH terminal and the SFTP transport. It lives in `desktop` rather than
`session-core` because all three credential sources are desktop-only — the hosts
repository comes from `@hypershell/db`, and secure storage and the 1Password
resolver are Electron-side.

Deliberately excludes `~/.ssh/config`. See [Effective SSH config](#effective-ssh-config).

## Effective SSH config

What OpenSSH itself concludes about a host after Host patterns, `Match` blocks
and `Include` files are applied — obtained by running `ssh -G <target>` and
parsing the output (`connection/sftpConnectionOptions.ts`).

This exists only for SFTP. The SSH terminal spawns the system `ssh` binary,
which reads `~/.ssh/config` itself; ssh2 cannot, so the SFTP path has to
reconstruct what the binary would have done. The asymmetry between the two
transports is correct, and is why credential resolution stops short of config.

## Connection challenge

Anything the app must ask the user during a connection attempt: an SFTP password
prompt, host-key verification, keyboard-interactive 2FA, or the tmux session
picker. Currently four separate hand-rolled flows in `App.tsx` rather than one
concept — see the architecture review.
