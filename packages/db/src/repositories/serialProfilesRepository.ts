import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type SerialProfileRecord = {
  id: string;
  name: string;
  path: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flowControl: string;
  localEcho: boolean;
  dtr: boolean;
  rts: boolean;
  notes: string | null;
};

export type SerialProfileInput = {
  id: string;
  name: string;
  path: string;
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  flowControl?: string;
  localEcho?: boolean;
  dtr?: boolean;
  rts?: boolean;
  notes?: string | null;
};

type SerialProfileRow = {
  id: string;
  name: string;
  path: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
  flow_control: string;
  local_echo: number;
  dtr: number;
  rts: number;
  notes: string | null;
};

function mapRow(row: SerialProfileRow): SerialProfileRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    baudRate: row.baud_rate,
    dataBits: row.data_bits,
    stopBits: row.stop_bits,
    parity: row.parity,
    flowControl: row.flow_control,
    localEcho: row.local_echo !== 0,
    dtr: row.dtr !== 0,
    rts: row.rts !== 0,
    notes: row.notes
  };
}

export function createSerialProfilesRepository(databasePath = ":memory:") {
  try {
    return createSerialProfilesRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") {
      throw error;
    }

    return createInMemorySerialProfilesRepository();
  }
}

export function createSerialProfilesRepositoryFromDatabase(db: SqliteDatabase) {
  const insertSerialProfile = db.prepare(`
    INSERT INTO serial_profiles (
      id, name, path, baud_rate, data_bits, stop_bits, parity,
      flow_control, local_echo, dtr, rts, notes
    )
    VALUES (
      @id, @name, @path, @baudRate, @dataBits, @stopBits, @parity,
      @flowControl, @localEcho, @dtr, @rts, @notes
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      baud_rate = excluded.baud_rate,
      data_bits = excluded.data_bits,
      stop_bits = excluded.stop_bits,
      parity = excluded.parity,
      flow_control = excluded.flow_control,
      local_echo = excluded.local_echo,
      dtr = excluded.dtr,
      rts = excluded.rts,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listSerialProfiles = db.prepare(`
    SELECT
      id, name, path, baud_rate, data_bits, stop_bits, parity,
      flow_control, local_echo, dtr, rts, notes
    FROM serial_profiles
    ORDER BY name COLLATE NOCASE ASC
  `);
  const getSerialProfileById = db
    .prepare(
      `
        SELECT
          id, name, path, baud_rate, data_bits, stop_bits, parity,
          flow_control, local_echo, dtr, rts, notes
        FROM serial_profiles
        WHERE id = ?
      `
    );

  const deleteSerialProfile = db.prepare(`DELETE FROM serial_profiles WHERE id = ?`);

  return {
    create(input: SerialProfileInput): SerialProfileRecord {
      const normalized = {
        ...input,
        baudRate: input.baudRate ?? 9600,
        dataBits: input.dataBits ?? 8,
        stopBits: input.stopBits ?? 1,
        parity: input.parity ?? "none",
        flowControl: input.flowControl ?? "none",
        localEcho: input.localEcho ?? false,
        dtr: input.dtr ?? true,
        rts: input.rts ?? true,
        notes: input.notes ?? null
      };

      insertSerialProfile.run(normalized);
      const row = getSerialProfileById.get(input.id) as
        | SerialProfileRow
        | undefined;
      if (!row) {
        throw new Error(`Serial profile ${input.id} was not persisted`);
      }

      return mapRow(row);
    },
    get(id: string): SerialProfileRecord | undefined {
      const row = getSerialProfileById.get(id) as SerialProfileRow | undefined;

      return row ? mapRow(row) : undefined;
    },
    list(): SerialProfileRecord[] {
      return (listSerialProfiles.all() as SerialProfileRow[]).map(mapRow);
    },
    remove(id: string): boolean {
      const result = deleteSerialProfile.run(id);
      return result.changes > 0;
    }
  };
}

function createInMemorySerialProfilesRepository() {
  const profiles = new Map<string, SerialProfileRecord>();

  return {
    create(input: SerialProfileInput): SerialProfileRecord {
      const record: SerialProfileRecord = {
        id: input.id,
        name: input.name,
        path: input.path,
        baudRate: input.baudRate ?? 9600,
        dataBits: input.dataBits ?? 8,
        stopBits: input.stopBits ?? 1,
        parity: input.parity ?? "none",
        flowControl: input.flowControl ?? "none",
        localEcho: input.localEcho ?? false,
        dtr: input.dtr ?? true,
        rts: input.rts ?? true,
        notes: input.notes ?? null
      };

      profiles.set(record.id, record);
      return record;
    },
    get(id: string): SerialProfileRecord | undefined {
      return profiles.get(id);
    },
    list(): SerialProfileRecord[] {
      return Array.from(profiles.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },
    remove(id: string): boolean {
      return profiles.delete(id);
    }
  };
}
