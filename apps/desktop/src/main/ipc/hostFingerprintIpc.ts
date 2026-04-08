import { createHostFingerprintRepositoryFromDatabase } from "@sshterm/db";
import {
  ipcChannels,
  hostFingerprintLookupRequestSchema,
  hostFingerprintTrustRequestSchema,
  hostFingerprintRemoveRequestSchema,
} from "@sshterm/shared";
import type { IpcMainLike } from "./registerIpc";
import type { SqliteDatabase } from "@sshterm/db";

export function registerHostFingerprintIpc(
  ipcMain: IpcMainLike,
  getDatabase: () => SqliteDatabase
) {
  const repo = createHostFingerprintRepositoryFromDatabase(getDatabase());

  ipcMain.handle(ipcChannels.hostFingerprint.lookup, async (_event: unknown, request: unknown) => {
    const parsed = hostFingerprintLookupRequestSchema.parse(request);
    const record = repo.findByHostAndAlgorithm(parsed.hostname, parsed.port, parsed.algorithm);
    return record ?? null;
  });

  ipcMain.handle(ipcChannels.hostFingerprint.trust, async (_event: unknown, request: unknown) => {
    const parsed = hostFingerprintTrustRequestSchema.parse(request);
    const id = parsed.id || `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Upsert the fingerprint record
    const record = repo.upsert({
      id,
      hostname: parsed.hostname,
      port: parsed.port,
      algorithm: parsed.algorithm,
      fingerprint: parsed.fingerprint,
    });
    // Mark it as trusted
    repo.trust(record.id);
    // Return updated record
    return repo.findByHostAndAlgorithm(parsed.hostname, parsed.port, parsed.algorithm) ?? record;
  });

  ipcMain.handle(ipcChannels.hostFingerprint.remove, async (_event: unknown, request: unknown) => {
    const parsed = hostFingerprintRemoveRequestSchema.parse(request);
    repo.removeByHost(parsed.hostname, parsed.port);
  });
}
