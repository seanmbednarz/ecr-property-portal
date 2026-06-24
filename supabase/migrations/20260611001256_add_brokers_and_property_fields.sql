-- Add extra fields to properties
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS parking_ratio text,
  ADD COLUMN IF NOT EXISTS walk_score integer,
  ADD COLUMN IF NOT EXISTS property_notes text,
  ADD COLUMN IF NOT EXISTS sublabel text;

-- Add notes column to suites for suite-level notes
ALTER TABLE property_suites
  ADD COLUMN IF NOT EXISTS notes text;

-- Brokers table
CREATE TABLE IF NOT EXISTS brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text,
  phone text,
  email text,
  photo_url text,
  display_order integer DEFAULT 0
);

ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_brokers" ON brokers FOR SELECT TO authenticated USING (true);

-- Property-broker junction
CREATE TABLE IF NOT EXISTS property_brokers (
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES brokers(id) ON DELETE CASCADE,
  PRIMARY KEY (property_id, broker_id)
);

ALTER TABLE property_brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_property_brokers" ON property_brokers FOR SELECT TO authenticated USING (true);
