-- Add slug and thumbnail support to diagrams
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- Backfill slugs for existing diagrams
UPDATE diagrams
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
         || '-' || substr(id::text, 1, 6)
WHERE slug IS NULL;

ALTER TABLE diagrams ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_diagrams_slug ON diagrams(slug);
