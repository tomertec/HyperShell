import { describe, expect, it } from "vitest";

import {
  fsDialogPathResponseSchema,
  fsListRequestSchema,
  fsShowOpenDialogRequestSchema,
  fsShowSaveDialogRequestSchema,
  sftpChmodRequestSchema,
  sftpConnectRequestSchema,
  sftpDragOutRequestSchema,
  sftpEventSchema,
  sftpListRequestSchema,
  sftpReadFileResponseSchema,
  sftpTransferStartRequestSchema,
  sftpWriteFileRequestSchema,
  sftpWriteFileResponseSchema,
  transferJobStatusSchema
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

  it("validates fs show-save-dialog request", () => {
    const result = fsShowSaveDialogRequestSchema.safeParse({
      defaultPath: "C:\\Users\\test\\file.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    expect(result.success).toBe(true);
  });

  it("validates fs show-open-dialog request", () => {
    const result = fsShowOpenDialogRequestSchema.safeParse({
      title: "Open backup",
      defaultPath: "C:\\Users\\test",
      filters: [{ name: "DB", extensions: ["db"] }],
    });
    expect(result.success).toBe(true);
  });

  it("validates fs dialog path responses", () => {
    expect(fsDialogPathResponseSchema.safeParse("C:\\Users\\test\\file.txt").success).toBe(true);
    expect(fsDialogPathResponseSchema.safeParse(null).success).toBe(true);
  });
});

describe("sftpDragOutRequestSchema", () => {
  it("should accept valid drag-out request", () => {
    const result = sftpDragOutRequestSchema.parse({
      sftpSessionId: "sess-1",
      remotePath: "/home/user/file.txt",
      fileName: "file.txt",
    });
    expect(result.sftpSessionId).toBe("sess-1");
    expect(result.remotePath).toBe("/home/user/file.txt");
    expect(result.fileName).toBe("file.txt");
  });

  it("should reject missing fields", () => {
    expect(() =>
      sftpDragOutRequestSchema.parse({ sftpSessionId: "sess-1" })
    ).toThrow();
  });
});

describe("transferJobStatusSchema", () => {
  it("accepts interrupted status", () => {
    expect(transferJobStatusSchema.parse("interrupted")).toBe("interrupted");
  });

  it("accepts all existing statuses", () => {
    for (const s of ["queued", "active", "paused", "completed", "failed"]) {
      expect(transferJobStatusSchema.parse(s)).toBe(s);
    }
  });
});

describe("write-file versioning", () => {
  it("carries version metadata on a read response", () => {
    const parsed = sftpReadFileResponseSchema.parse({
      content: "hi",
      encoding: "utf-8",
      size: 2,
      modifiedAt: "2026-08-13T00:00:00.000Z"
    });

    expect(parsed.size).toBe(2);
    expect(parsed.modifiedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("accepts a write request without expectations (force overwrite)", () => {
    const parsed = sftpWriteFileRequestSchema.parse({
      sftpSessionId: "s1",
      path: "/r/f",
      content: "hi"
    });

    expect(parsed.expectedSize).toBeUndefined();
    expect(parsed.expectedModifiedAt).toBeUndefined();
    expect("expectedSize" in parsed).toBe(false);
    expect("expectedModifiedAt" in parsed).toBe(false);
  });

  it("round-trips a write request with both expectations (conditional write)", () => {
    const parsed = sftpWriteFileRequestSchema.parse({
      sftpSessionId: "s1",
      path: "/r/f",
      content: "hi",
      expectedSize: 42,
      expectedModifiedAt: "2026-08-13T00:00:00.000Z"
    });

    expect(parsed.expectedSize).toBe(42);
    expect(parsed.expectedModifiedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("reports a conflict outcome", () => {
    const parsed = sftpWriteFileResponseSchema.parse({
      status: "conflict",
      size: 9,
      modifiedAt: "2026-08-13T01:00:00.000Z"
    });

    expect(parsed.status).toBe("conflict");
  });
});
