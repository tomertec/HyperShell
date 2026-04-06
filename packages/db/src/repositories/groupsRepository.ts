import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type GroupRecord = {
  id: string;
  name: string;
  description: string | null;
};

export type GroupInput = {
  id: string;
  name: string;
  description?: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
};

export function createGroupsRepositoryFromDatabase(db: SqliteDatabase) {
  const insertGroup = db.prepare(`
    INSERT INTO host_groups (id, name, description)
    VALUES (@id, @name, @description)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      updated_at = CURRENT_TIMESTAMP
  `);
  const listGroups = db.prepare("SELECT id, name, description FROM host_groups ORDER BY name COLLATE NOCASE ASC");
  const getGroupById = db.prepare("SELECT id, name, description FROM host_groups WHERE id = ?");
  const deleteGroup = db.prepare("DELETE FROM host_groups WHERE id = ?");

  return {
    create(input: GroupInput): GroupRecord {
      const normalized = {
        id: input.id,
        name: input.name,
        description: input.description ?? null
      };
      insertGroup.run(normalized);
      const row = getGroupById.get(input.id) as GroupRow | undefined;
      if (!row) throw new Error(`Group ${input.id} was not persisted`);
      return row;
    },
    list(): GroupRecord[] {
      return listGroups.all() as GroupRecord[];
    },
    get(id: string): GroupRecord | undefined {
      return getGroupById.get(id) as GroupRecord | undefined;
    },
    remove(id: string): boolean {
      const result = deleteGroup.run(id);
      return result.changes > 0;
    }
  };
}

export function createGroupsRepository(databasePath = ":memory:") {
  try {
    return createGroupsRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") throw error;

    const groups = new Map<string, GroupRecord>();
    return {
      create(input: GroupInput): GroupRecord {
        const record: GroupRecord = {
          id: input.id,
          name: input.name,
          description: input.description ?? null
        };
        groups.set(record.id, record);
        return record;
      },
      list(): GroupRecord[] {
        return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
      },
      get(id: string): GroupRecord | undefined {
        return groups.get(id);
      },
      remove(id: string): boolean {
        return groups.delete(id);
      }
    };
  }
}
