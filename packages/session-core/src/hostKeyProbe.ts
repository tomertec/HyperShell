import { Client } from "ssh2";
import { createHash } from "node:crypto";

export interface HostKeyInfo {
  algorithm: string;
  fingerprint: string;
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

        // Parse the key type from the SSH key blob format:
        // uint32 length + string type + ...
        let algorithm = "unknown";
        try {
          if (key.length >= 4) {
            const typeLen = key.readUInt32BE(0);
            if (typeLen > 0 && typeLen < key.length) {
              algorithm = key.subarray(4, 4 + typeLen).toString("ascii");
            }
          }
        } catch {
          // Fallback to unknown
        }

        resolve({ algorithm, fingerprint });
        // Returning false rejects the host key which terminates the handshake.
        return false;
      },
    });
  });
}
