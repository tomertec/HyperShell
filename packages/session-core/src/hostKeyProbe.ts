import { Client } from "ssh2";
import { createHash } from "node:crypto";

export interface HostKeyInfo {
  algorithm: string;
  fingerprint: string;
}

/**
 * Read the algorithm name out of an SSH key blob (uint32 length + string type).
 * Returns "unknown" for anything that does not carry a complete type string.
 */
export function parseHostKeyAlgorithm(key: Buffer): string {
  if (key.length < 4) {
    return "unknown";
  }

  const typeLen = key.readUInt32BE(0);
  // Bound against the end of the type string, not the start: with
  // `typeLen < key.length` a truncated blob still passes and subarray()
  // silently clamps, yielding a half-read algorithm name.
  if (typeLen <= 0 || 4 + typeLen > key.length) {
    return "unknown";
  }

  return key.subarray(4, 4 + typeLen).toString("ascii");
}

/**
 * Probes the server's host key by initiating a lightweight ssh2 handshake.
 * Returns the algorithm and SHA-256 fingerprint of the server's key.
 * The connection is immediately destroyed after obtaining the key.
 */
export function probeHostKey(
  hostname: string,
  port: number
): Promise<HostKeyInfo> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        client.destroy();
        reject(new Error("Host key probe timed out"));
      }
    }, 10_000);

    client.on("error", (err: Error) => {
      clearTimeout(timeout);
      if (!resolved) {
        // If we already resolved from hostVerifier, ignore errors caused
        // by aborting the connection (returning false from hostVerifier).
        client.destroy();
        reject(err);
      }
    });

    client.connect({
      host: hostname,
      port,
      // Dummy username — we only need the handshake to capture the host key.
      username: "_probe_",
      // The hostVerifier callback receives the raw host key buffer.
      // Returning false aborts the connection after capturing the key.
      hostVerifier: (key: Buffer) => {
        clearTimeout(timeout);
        resolved = true;

        const hash = createHash("sha256").update(key).digest("base64");
        const fingerprint = `SHA256:${hash}`;

        resolve({ algorithm: parseHostKeyAlgorithm(key), fingerprint });
        // Returning false rejects the host key which terminates the handshake.
        return false;
      },
    });
  });
}
