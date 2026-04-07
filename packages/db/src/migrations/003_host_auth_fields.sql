ALTER TABLE hosts ADD COLUMN auth_method TEXT DEFAULT 'default';
ALTER TABLE hosts ADD COLUMN agent_kind TEXT DEFAULT 'system';
ALTER TABLE hosts ADD COLUMN op_reference TEXT;
