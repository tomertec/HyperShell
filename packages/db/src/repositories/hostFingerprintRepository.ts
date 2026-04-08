import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type HostFingerprintRecord = {
  id: string;
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  isTrusted: boolean;
  firstSeen: string;
  lastSeen: string;
};

export type HostFingerprintInput = {
  id: string;
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
};

type HostFingerprintRow = {
  id: string;
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  is_trusted: number;
  first_seen: string;
  last_seen: string;
};

function mapRow(row: HostFingerprintRow): HostFingerprintRecord {
  return {
    id: row.id,
    hostname: row.hostname,
    port: row.port,
    algorithm: row.algorithm,
    fingerprint: row.fingerprint,
    isTrusted: row.is_trusted === 1,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

export function createHostFingerprintRepository(databasePath = ":memory:") {
  return createHostFingerprintRepositoryFromDatabase(openDatabase(databasePath));
}

export function createHostFingerprintRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertFingerprint = db.prepare(`
    INSERT INTO host_fingerprints (id, hostname, port, algorithm, fingerprint, is_trusted)
    VALUES (@id, @hostname, @port, @algorithm, @fingerprint, 0)
    ON CONFLICT(hostname, port, algorithm) DO UPDATE SET
      fingerprint = excluded.fingerprint,
      last_seen = CURRENT_TIMESTAMP
  `);

  const trustFingerprint = db.prepare(`
    UPDATE host_fingerprints
    SET is_trusted = 1, last_seen = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const findByHostAndAlgorithm = db.prepare(`
    SELECT id, hostname, port, algorithm, fingerprint, is_trusted, first_seen, last_seen
    FROM host_fingerprints
    WHERE hostname = ? AND port = ? AND algorithm = ?
  `);

  const findByHost = db.prepare(`
    SELECT id, hostname, port, algorithm, fingerprint, is_trusted, first_seen, last_seen
    FROM host_fingerprints
    WHERE hostname = ? AND port = ?
  `);

  const deleteFingerprint = db.prepare(`DELETE FROM host_fingerprints WHERE id = ?`);

  const deleteByHost = db.prepare(`DELETE FROM host_fingerprints WHERE hostname = ? AND port = ?`);

  return {
    upsert(input: HostFingerprintInput): HostFingerprintRecord {
      upsertFingerprint.run(input);
      const row = findByHostAndAlgorithm.get(input.hostname, input.port, input.algorithm) as HostFingerprintRow | undefined;
      if (!row) {
        throw new Error(`Fingerprint for ${input.hostname}:${input.port} was not persisted`);
      }
      return mapRow(row);
    },

    trust(id: string): boolean {
      const result = trustFingerprint.run(id);
      return result.changes > 0;
    },

    findByHostAndAlgorithm(hostname: string, port: number, algorithm: string): HostFingerprintRecord | undefined {
      const row = findByHostAndAlgorithm.get(hostname, port, algorithm) as HostFingerprintRow | undefined;
      return row ? mapRow(row) : undefined;
    },

    findByHost(hostname: string, port: number): HostFingerprintRecord[] {
      return (findByHost.all(hostname, port) as HostFingerprintRow[]).map(mapRow);
    },

    remove(id: string): boolean {
      const result = deleteFingerprint.run(id);
      return result.changes > 0;
    },

    removeByHost(hostname: string, port: number): boolean {
      const result = deleteByHost.run(hostname, port);
      return result.changes > 0;
    },
  };
}
