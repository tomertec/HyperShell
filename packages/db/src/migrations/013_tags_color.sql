-- Migration 013: add color column to tags table
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
ALTER TABLE tags ADD COLUMN color TEXT;
