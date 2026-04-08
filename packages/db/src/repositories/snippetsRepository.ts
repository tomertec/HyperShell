import type { SqliteDatabase } from "../index";
import { openDatabase } from "../index";

export type SnippetRecord = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type SnippetInput = {
  id: string;
  name: string;
  body: string;
};

type SnippetRow = {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: SnippetRow): SnippetRecord {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSnippetsRepository(databasePath = ":memory:") {
  try {
    return createSnippetsRepositoryFromDatabase(openDatabase(databasePath));
  } catch (error) {
    if (databasePath !== ":memory:") {
      throw error;
    }

    return createInMemorySnippetsRepository();
  }
}

export function createSnippetsRepositoryFromDatabase(db: SqliteDatabase) {
  const upsertSnippet = db.prepare(`
    INSERT INTO snippets (id, name, body)
    VALUES (@id, @name, @body)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      body = excluded.body,
      updated_at = CURRENT_TIMESTAMP
  `);

  const listSnippets = db.prepare(`
    SELECT id, name, body, created_at, updated_at
    FROM snippets
    ORDER BY name COLLATE NOCASE ASC
  `);

  const getSnippetById = db.prepare(`
    SELECT id, name, body, created_at, updated_at
    FROM snippets
    WHERE id = ?
  `);

  const deleteSnippet = db.prepare(`DELETE FROM snippets WHERE id = ?`);

  return {
    create(input: SnippetInput): SnippetRecord {
      upsertSnippet.run(input);
      const row = getSnippetById.get(input.id) as SnippetRow | undefined;
      if (!row) {
        throw new Error(`Snippet ${input.id} was not persisted`);
      }

      return mapRow(row);
    },
    list(): SnippetRecord[] {
      return (listSnippets.all() as SnippetRow[]).map(mapRow);
    },
    get(id: string): SnippetRecord | undefined {
      const row = getSnippetById.get(id) as SnippetRow | undefined;

      return row ? mapRow(row) : undefined;
    },
    remove(id: string): boolean {
      const result = deleteSnippet.run(id);
      return result.changes > 0;
    },
  };
}

function createInMemorySnippetsRepository() {
  const snippets = new Map<string, SnippetRecord>();

  return {
    create(input: SnippetInput): SnippetRecord {
      const record: SnippetRecord = {
        id: input.id,
        name: input.name,
        body: input.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      snippets.set(record.id, record);
      return record;
    },
    list(): SnippetRecord[] {
      return Array.from(snippets.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },
    get(id: string): SnippetRecord | undefined {
      return snippets.get(id);
    },
    remove(id: string): boolean {
      return snippets.delete(id);
    },
  };
}
