// Default ServerAliveInterval / keepaliveInterval for SSH PTY sessions and the
// ssh2 connection pool. Prevents idle connections from being dropped by NAT or
// stateful firewalls. SFTP intentionally uses a longer interval — see
// sftpTransport.ts.
export const DEFAULT_SSH_KEEP_ALIVE_SECONDS = 30;
