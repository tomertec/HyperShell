import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type TagRecord = {
  id: string;
  name: string;
  color: string | null;
};

export type TagInput = {
  id: string;
  name: string;
  color?: string | null;
};

type TagRow = {
  id: string;
  name: string;
  color: string | null;
};

type HostTagRow = {
  id: string;
  name: string;
  color: string | null;
};

function mapRow(row: TagRow | HostTagRow): TagRecord {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
  };
}

export function createTagRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertTag = db.prepare(`
    INSERT INTO tags (id, name, color)
    VALUES (@id, @name, @color)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = excluded.color
  `);

  const listTags = db.prepare(`
    SELECT id, name, color
    FROM tags
    ORDER BY name COLLATE NOCASE ASC
  `);

  const getTagById = db.prepare(`
    SELECT id, name, color
    FROM tags
    WHERE id = ?
  `);

  const deleteTag = db.prepare(`DELETE FROM tags WHERE id = ?`);

  const listHostTags = db.prepare(`
    SELECT t.id, t.name, t.color
    FROM host_tags ht
    INNER JOIN tags t ON t.id = ht.tag_id
    WHERE ht.host_id = ?
    ORDER BY t.name COLLATE NOCASE ASC
  `);

  const deleteHostTags = db.prepare(`DELETE FROM host_tags WHERE host_id = ?`);
  const insertHostTag = db.prepare(`
    INSERT OR IGNORE INTO host_tags (host_id, tag_id)
    VALUES (?, ?)
  `);

  const setHostTagsTx = db.transaction((hostId: string, tagIds: string[]) => {
    deleteHostTags.run(hostId);
    const uniqueTagIds = Array.from(new Set(tagIds));
    for (const tagId of uniqueTagIds) {
      insertHostTag.run(hostId, tagId);
    }
  });

  return {
    list(): TagRecord[] {
      return (listTags.all() as TagRow[]).map(mapRow);
    },
    upsert(input: TagInput): TagRecord {
      const normalized = {
        id: input.id,
        name: input.name,
        color: input.color ?? null,
      };
      upsertTag.run(normalized);

      const row = getTagById.get(input.id) as TagRow | undefined;
      if (!row) {
        throw new Error(`Tag ${input.id} was not persisted`);
      }
      return mapRow(row);
    },
    remove(id: string): boolean {
      return deleteTag.run(id).changes > 0;
    },
    getHostTags(hostId: string): TagRecord[] {
      return (listHostTags.all(hostId) as HostTagRow[]).map(mapRow);
    },
    setHostTags(hostId: string, tagIds: string[]): TagRecord[] {
      setHostTagsTx(hostId, tagIds);
      return (listHostTags.all(hostId) as HostTagRow[]).map(mapRow);
    },
  };
}

export function createTagRepository(databasePath = ":memory:") {
  try {
    return createTagRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") {
      throw error;
    }

    const tags = new Map<string, TagRecord>();
    const hostTags = new Map<string, Set<string>>();

    const list = () =>
      Array.from(tags.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      );

    return {
      list,
      upsert(input: TagInput): TagRecord {
        const record: TagRecord = {
          id: input.id,
          name: input.name,
          color: input.color ?? null,
        };
        tags.set(record.id, record);
        return record;
      },
      remove(id: string): boolean {
        const removed = tags.delete(id);
        if (!removed) {
          return false;
        }

        for (const [hostId, ids] of hostTags.entries()) {
          ids.delete(id);
          if (ids.size === 0) {
            hostTags.delete(hostId);
          }
        }
        return true;
      },
      getHostTags(hostId: string): TagRecord[] {
        const ids = hostTags.get(hostId);
        if (!ids || ids.size === 0) {
          return [];
        }
        return Array.from(ids)
          .map((tagId) => tags.get(tagId))
          .filter((item): item is TagRecord => Boolean(item))
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      setHostTags(hostId: string, tagIds: string[]): TagRecord[] {
        const nextIds = new Set(
          Array.from(new Set(tagIds)).filter((tagId) => tags.has(tagId))
        );
        hostTags.set(hostId, nextIds);
        return Array.from(nextIds)
          .map((tagId) => tags.get(tagId))
          .filter((item): item is TagRecord => Boolean(item))
          .sort((left, right) => left.name.localeCompare(right.name));
      },
    };
  }
}
