import { describe, expect, it } from "vitest";

import {
  fsListRequestSchema,
  sftpChmodRequestSchema,
  sftpConnectRequestSchema,
  sftpEventSchema,
  sftpListRequestSchema,
  sftpTransferStartRequestSchema
} from "./sftpSchemas";

describe("SFTP schemas", () => {
  it("validates connect request by hostId", () => {
    const result = sftpConnectRequestSchema.safeParse({ hostId: "abc123" });
    expect(result.success).toBe(true);
  });

  it("validates connect request by sessionId", () => {
    const result = sftpConnectRequestSchema.safeParse({ sessionId: "sess-1" });
    expect(result.success).toBe(true);
  });

  it("validates connect request with password override", () => {
    const result = sftpConnectRequestSchema.safeParse({
      hostId: "abc123",
      username: "root",
      password: "secret"
    });
    expect(result.success).toBe(true);
  });

  it("rejects connect request with neither hostId nor sessionId", () => {
    const result = sftpConnectRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("validates list request", () => {
    const result = sftpListRequestSchema.safeParse({
      sftpSessionId: "sftp-1",
      path: "/home/user"
    });
    expect(result.success).toBe(true);
  });

  it("validates chmod request", () => {
    const result = sftpChmodRequestSchema.safeParse({
      sftpSessionId: "sftp-1",
      path: "/home/user/.ssh/id_rsa",
      permissions: 0o600
    });
    expect(result.success).toBe(true);
  });

  it("validates transfer start request", () => {
    const result = sftpTransferStartRequestSchema.safeParse({
      sftpSessionId: "sftp-1",
      operations: [
        {
          type: "upload",
          localPath: "C:\\Users\\test\\file.txt",
          remotePath: "/home/user/file.txt",
          isDirectory: false
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it("validates transfer-progress event", () => {
    const result = sftpEventSchema.safeParse({
      kind: "transfer-progress",
      transferId: "tx-1",
      bytesTransferred: 1024,
      totalBytes: 4096,
      speed: 512,
      status: "active"
    });
    expect(result.success).toBe(true);
  });

  it("validates fs list request", () => {
    const result = fsListRequestSchema.safeParse({ path: "C:\\Users" });
    expect(result.success).toBe(true);
  });
});
