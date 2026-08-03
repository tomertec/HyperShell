-- Migration 017: opt out of SSH shell integration per host.
-- Defaults to 1: the feature is on unless a host is known to dislike injection.
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
ALTER TABLE hosts ADD COLUMN shell_integration INTEGER NOT NULL DEFAULT 1;
