import type { SqliteDatabase } from "../index";

export interface WorkspaceLayout {
  tabs: Array<{
    transport: string;
    profileId: string;
    title: string;
    type?: string;
    hostId?: string;
  }>;
  splitDirection: "horizontal" | "vertical";
  paneSizes: number[];
  paneCount: number;
}

export interface WorkspaceRecord {
  name: string;
  layout: WorkspaceLayout;
  updatedAt: string;
}

export interface WorkspaceRepository {
  save(name: string, layout: WorkspaceLayout): void;
  load(name: string): WorkspaceRecord | undefined;
  list(): WorkspaceRecord[];
  remove(name: string): boolean;
}

export function createWorkspaceRepositoryFromDatabase(db: SqliteDatabase): WorkspaceRepository {
  const upsertStmt = db.prepare(
    "INSERT OR REPLACE INTO session_layouts (id, name, layout_json, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  );
  const selectStmt = db.prepare(
    "SELECT name, layout_json, updated_at FROM session_layouts WHERE name = ?"
  );
  const listStmt = db.prepare(
    "SELECT name, layout_json, updated_at FROM session_layouts ORDER BY updated_at DESC"
  );
  const deleteStmt = db.prepare("DELETE FROM session_layouts WHERE name = ?");

  return {
    save(name, layout) {
      upsertStmt.run(name, name, JSON.stringify(layout));
    },

    load(name) {
      const row = selectStmt.get(name) as
        | { name: string; layout_json: string; updated_at: string }
        | undefined;
      if (!row) return undefined;
      return {
        name: row.name,
        layout: JSON.parse(row.layout_json),
        updatedAt: row.updated_at,
      };
    },

    list() {
      const rows = listStmt.all() as Array<{
        name: string;
        layout_json: string;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        name: row.name,
        layout: JSON.parse(row.layout_json),
        updatedAt: row.updated_at,
      }));
    },

    remove(name) {
      const result = deleteStmt.run(name);
      return result.changes > 0;
    },
  };
}

export function createWorkspaceRepository(db: SqliteDatabase): WorkspaceRepository {
  return createWorkspaceRepositoryFromDatabase(db);
}
