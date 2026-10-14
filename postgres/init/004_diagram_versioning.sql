-- Element-level optimistic concurrency support.
-- Monotonic document version, bumped on every successful diagram mutation.
-- Existing rows are backfilled to 1 by the DEFAULT on ADD COLUMN.
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
