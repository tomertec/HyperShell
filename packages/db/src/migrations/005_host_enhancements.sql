-- 005_host_enhancements.sql
-- Adds sort_order for drag-and-drop reordering and color for visual tagging

ALTER TABLE hosts ADD COLUMN sort_order INTEGER;
ALTER TABLE host_groups ADD COLUMN sort_order INTEGER;
ALTER TABLE hosts ADD COLUMN color TEXT;
