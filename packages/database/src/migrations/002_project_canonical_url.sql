-- Add canonical_url to projects for scheme-probed base URL
ALTER TABLE projects ADD COLUMN IF NOT EXISTS canonical_url TEXT;
