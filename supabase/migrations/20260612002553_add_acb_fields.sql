
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS target_sf integer,
  ADD COLUMN IF NOT EXISTS max_contiguous_sf integer,
  ADD COLUMN IF NOT EXISTS broker_notes text[],
  ADD COLUMN IF NOT EXISTS scores jsonb,
  ADD COLUMN IF NOT EXISTS client text DEFAULT 'svb';
