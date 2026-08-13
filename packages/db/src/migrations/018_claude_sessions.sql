-- Migration 018: per-tab Claude Code session resume.
--
-- local_profiles.claude_session marks a profile as a Claude launcher. When set,
-- the main process appends `--session-id <uuid>` (new session) or
-- `--resume <uuid>` (restore) to the profile's args. Defaults to 0 so every
-- existing and auto-detected shell profile is unaffected.
--
-- saved_sessions.claude_session_id carries the assigned id through the crash
-- recovery path, mirroring what the workspace layout stores for the graceful
-- restart path.
--
-- Guard: SQLite raises "duplicate column" if it already exists; callers catch that.
-- claude_session_mode picks which conversation a launch lands in:
--   'continue' runs `claude --continue`, joining the most recent conversation
--             for the working directory no matter what started it, including a
--             plain `claude` typed into a PowerShell tab.
--   'new'     runs `claude --session-id <uuid>`, so the tab owns a private
--             conversation that can later be restored exactly by id.
-- Statements are applied one at a time by openDatabase, so adding a column here
-- still lands on databases where the earlier two already ran.
ALTER TABLE local_profiles ADD COLUMN claude_session INTEGER NOT NULL DEFAULT 0;
ALTER TABLE saved_sessions ADD COLUMN claude_session_id TEXT;
ALTER TABLE local_profiles ADD COLUMN claude_session_mode TEXT NOT NULL DEFAULT 'continue';
