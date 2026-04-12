import { describe, expect, it } from "vitest";

import { buildConnectConfig, type SftpConnectionOptions } from "./sftpTransport";

describe("buildConnectConfig", () => {
  const baseOptions: SftpConnectionOptions = {
    hostname: "example.com",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpass",
  };

  it("adds a hostVerifier when trusted fingerprints are provided", () => {
    const config = buildConnectConfig(baseOptions, undefined, {
      trustedHostFingerprints: ["SHA256:abc123"],
    });

    expect(config.hostVerifier).toBeTypeOf("function");
  });

  it("accepts only trusted SHA256 host fingerprints", () => {
    const config = buildConnectConfig(baseOptions, undefined, {
      trustedHostFingerprints: ["SHA256:T17j3bElrAp7GM9254XJ8U9Pwjzk4JP5vC2CcWW6mGM="],
    });

    const hostVerifier = config.hostVerifier as (key: Buffer) => boolean;
    expect(hostVerifier(Buffer.from("trusted-host-key"))).toBe(true);
    expect(hostVerifier(Buffer.from("different-host-key"))).toBe(false);
  });
});
