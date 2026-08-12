import { describe, expect, it } from "vitest";

import { parseHostKeyAlgorithm } from "./hostKeyProbe";

function keyBlob(algorithm: string, rest = "payload"): Buffer {
  const type = Buffer.from(algorithm, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(type.length, 0);
  return Buffer.concat([length, type, Buffer.from(rest, "ascii")]);
}

describe("parseHostKeyAlgorithm", () => {
  it("reads the algorithm from a well-formed blob", () => {
    expect(parseHostKeyAlgorithm(keyBlob("ssh-ed25519"))).toBe("ssh-ed25519");
    expect(parseHostKeyAlgorithm(keyBlob("rsa-sha2-512"))).toBe("rsa-sha2-512");
  });

  it("reads an algorithm that fills the blob exactly", () => {
    expect(parseHostKeyAlgorithm(keyBlob("ssh-ed25519", ""))).toBe("ssh-ed25519");
  });

  it("returns unknown when the type string is truncated", () => {
    // Declares 11 bytes of type but carries only 6 - the old bound
    // (typeLen < key.length) accepted this and subarray() clamped it to "ssh-ed".
    const truncated = keyBlob("ssh-ed25519").subarray(0, 4 + 6);
    expect(parseHostKeyAlgorithm(truncated)).toBe("unknown");
  });

  it("returns unknown for empty, short, and zero-length-type blobs", () => {
    expect(parseHostKeyAlgorithm(Buffer.alloc(0))).toBe("unknown");
    expect(parseHostKeyAlgorithm(Buffer.from([0, 0, 11]))).toBe("unknown");
    expect(parseHostKeyAlgorithm(Buffer.alloc(8))).toBe("unknown");
  });

  it("returns unknown when the declared length is absurd", () => {
    const blob = keyBlob("ssh-ed25519");
    blob.writeUInt32BE(0xffffffff, 0);
    expect(parseHostKeyAlgorithm(blob)).toBe("unknown");
  });
});
