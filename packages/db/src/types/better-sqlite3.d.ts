declare module "better-sqlite3" {
  interface Statement<Params extends unknown[] = unknown[], Result = unknown> {
    run(...params: Params): { changes: number; lastInsertRowid: bigint | number };
    get(...params: Params): Result | undefined;
    all(...params: Params): Result[];
  }

  interface Database {
    prepare<Params extends unknown[] = unknown[], Result = unknown>(
      sql: string
    ): Statement<Params, Result>;
    exec(sql: string): this;
    pragma(source: string): unknown;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
