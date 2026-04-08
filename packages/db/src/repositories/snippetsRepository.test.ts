import { beforeEach, describe, expect, it } from "vitest";

import { createSnippetsRepositoryFromDatabase, type SnippetRecord } from "./snippetsRepository";
import { openDatabase, type SqliteDatabase } from "../index";

describe("SnippetsRepository", () => {
  let db: SqliteDatabase;
  let repo: ReturnType<typeof createSnippetsRepositoryFromDatabase>;

  beforeEach(() => {
    db = openDatabase();
    repo = createSnippetsRepositoryFromDatabase(db);
  });

  it("creates and lists snippets", () => {
    repo.create({ id: "1", name: "Hello", body: "echo hello" });
    repo.create({ id: "2", name: "World", body: "echo world" });

    const snippets = repo.list();
    expect(snippets).toHaveLength(2);
    expect(snippets[0]?.name).toBe("Hello");
    expect(snippets[0]?.body).toBe("echo hello");
    expect(snippets[1]?.name).toBe("World");
    expect(snippets[1]?.body).toBe("echo world");
  });

  it("lists snippets sorted by name (case-insensitive)", () => {
    repo.create({ id: "1", name: "Zebra", body: "z" });
    repo.create({ id: "2", name: "Apple", body: "a" });
    repo.create({ id: "3", name: "banana", body: "b" });

    const snippets = repo.list();
    expect(snippets).toHaveLength(3);
    expect(snippets[0]?.name).toBe("Apple");
    expect(snippets[1]?.name).toBe("banana");
    expect(snippets[2]?.name).toBe("Zebra");
  });

  it("upserts (updates) existing snippet", () => {
    const created = repo.create({ id: "1", name: "Original", body: "orig" });
    expect(created.name).toBe("Original");

    repo.create({ id: "1", name: "Updated", body: "new body" });

    const snippet = repo.get("1");
    expect(snippet?.name).toBe("Updated");
    expect(snippet?.body).toBe("new body");
  });

  it("gets snippet by id", () => {
    repo.create({ id: "abc123", name: "Test", body: "test body" });

    const snippet = repo.get("abc123");
    expect(snippet).toBeDefined();
    expect(snippet?.name).toBe("Test");
    expect(snippet?.body).toBe("test body");
  });

  it("returns undefined for nonexistent snippet", () => {
    const snippet = repo.get("nonexistent");
    expect(snippet).toBeUndefined();
  });

  it("removes snippet and returns true", () => {
    repo.create({ id: "1", name: "ToDelete", body: "delete me" });

    const result = repo.remove("1");
    expect(result).toBe(true);

    const snippet = repo.get("1");
    expect(snippet).toBeUndefined();
  });

  it("remove returns false for nonexistent snippet", () => {
    const result = repo.remove("nonexistent");
    expect(result).toBe(false);
  });

  it("created_at and updated_at are set", () => {
    const snippet = repo.create({ id: "1", name: "Test", body: "body" });
    expect(snippet.createdAt).toBeDefined();
    expect(snippet.updatedAt).toBeDefined();
  });
});
