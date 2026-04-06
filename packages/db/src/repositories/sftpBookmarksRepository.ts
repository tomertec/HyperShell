import type { SqliteDatabase } from "../index";

export interface SftpBookmarkRecord {
  id: string;
  hostId: string;
  name: string;
  remotePath: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SftpBookmarkInput {
  id?: string;
  hostId: string;
  name: string;
  remotePath: string;
  sortOrder?: number;
}

interface SftpBookmarkRow {
  id: string;
  host_id: string;
  name: string;
  remote_path: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SftpBookmarkRow): SftpBookmarkRecord {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    remotePath: row.remote_path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createSftpBookmarksRepository(db: SqliteDatabase) {
  const insertBookmark = db.prepare(`
    INSERT INTO sftp_bookmarks (id, host_id, name, remote_path, sort_order)
    VALUES (@id, @hostId, @name, @remotePath, @sortOrder)
  `);
  const updateBookmark = db.prepare(`
    UPDATE sftp_bookmarks
    SET name = @name,
        remote_path = @remotePath,
        sort_order = COALESCE(@sortOrder, sort_order),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const getBookmarkById = db.prepare(`
    SELECT id, host_id, name, remote_path, sort_order, created_at, updated_at
    FROM sftp_bookmarks
    WHERE id = ?
  `);
  const listBookmarksByHost = db.prepare(`
    SELECT id, host_id, name, remote_path, sort_order, created_at, updated_at
    FROM sftp_bookmarks
    WHERE host_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `);
  const deleteBookmark = db.prepare("DELETE FROM sftp_bookmarks WHERE id = ?");
  const nextSortOrderByHost = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
    FROM sftp_bookmarks
    WHERE host_id = ?
  `);
  const reorderBookmark = db.prepare(`
    UPDATE sftp_bookmarks
    SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  function getRequiredBookmark(id: string): SftpBookmarkRecord {
    const row = getBookmarkById.get(id) as SftpBookmarkRow | undefined;
    if (!row) {
      throw new Error(`SFTP bookmark ${id} was not persisted`);
    }

    return mapRow(row);
  }

  return {
    upsert(input: SftpBookmarkInput): SftpBookmarkRecord {
      if (input.id) {
        updateBookmark.run({
          id: input.id,
          name: input.name,
          remotePath: input.remotePath,
          sortOrder: input.sortOrder ?? null
        });
        return getRequiredBookmark(input.id);
      }

      const generatedId = crypto.randomUUID().replace(/-/g, "");
      const computedSortOrder =
        input.sortOrder ??
        (
          nextSortOrderByHost.get(input.hostId) as {
            next: number;
          }
        ).next;

      insertBookmark.run({
        id: generatedId,
        hostId: input.hostId,
        name: input.name,
        remotePath: input.remotePath,
        sortOrder: computedSortOrder
      });

      return getRequiredBookmark(generatedId);
    },

    list(hostId: string): SftpBookmarkRecord[] {
      const rows = listBookmarksByHost.all(hostId) as SftpBookmarkRow[];
      return rows.map(mapRow);
    },

    remove(id: string): boolean {
      const result = deleteBookmark.run(id);
      return result.changes > 0;
    },

    reorder(bookmarkIds: string[]): void {
      const tx = db.transaction(() => {
        bookmarkIds.forEach((bookmarkId, index) => {
          reorderBookmark.run(index, bookmarkId);
        });
      });
      tx();
    }
  };
}
