-- Migration 014: add tmux_detect column to hosts table
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
ALTER TABLE hosts ADD COLUMN tmux_detect INTEGER NOT NULL DEFAULT 0;
