-- Migration 27 added triggers that maintain properties.updated_at — but the
-- properties table never actually had that column (the initial schema only
-- gave it created_at; the updated_at spotted nearby belonged to
-- property_notes). The triggers compile fine and only fail at runtime, so
-- every property/suite save errored with:
--   record "new" has no field "updated_at"
--
-- Backfilled from created_at rather than now() so pages don't all claim they
-- were updated the moment this migration ran.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE properties SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE properties
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
