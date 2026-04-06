import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function encodeSecret(secret: string): string {
  return Buffer.from(secret, "utf8").toString("base64");
}

function decodeSecret(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

function getSafeStorage(): SafeStorageLike | null {
  try {
    const electron = require("electron") as { safeStorage?: SafeStorageLike };
    return electron.safeStorage ?? null;
  } catch {
    return null;
  }
}

export function canUseSecureStorage(): boolean {
  return getSafeStorage()?.isEncryptionAvailable() ?? false;
}

export function protectSecret(secret: string): string {
  const safeStorage = getSafeStorage();

  if (!canUseSecureStorage()) {
    return encodeSecret(secret);
  }

  if (!safeStorage) {
    return encodeSecret(secret);
  }

  return safeStorage.encryptString(secret).toString("base64");
}

export function revealSecret(payload: string): string {
  const safeStorage = getSafeStorage();

  if (!canUseSecureStorage()) {
    return decodeSecret(payload);
  }

  if (!safeStorage) {
    return decodeSecret(payload);
  }

  return safeStorage.decryptString(Buffer.from(payload, "base64"));
}

export function roundTripSecret(secret: string): string {
  return revealSecret(protectSecret(secret));
}
