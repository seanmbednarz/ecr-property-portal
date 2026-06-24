
-- Properties table
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  description text,
  hero_image_url text,
  property_type text NOT NULL DEFAULT 'Office',
  market text NOT NULL DEFAULT '',
  total_sf integer,
  broker_name text NOT NULL DEFAULT '',
  broker_photo_url text,
  lat double precision,
  lng double precision,
  year_built integer,
  parking_ratio text,
  walk_score integer,
  property_notes text,
  sublabel text,
  brochure_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_properties" ON properties FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_properties" ON properties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_properties" ON properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_properties" ON properties FOR DELETE TO authenticated USING (true);

-- Property suites table
CREATE TABLE IF NOT EXISTS property_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  suite_name text NOT NULL,
  sf integer,
  base_rent numeric,
  op_exp numeric,
  full_svc numeric,
  monthly_rent numeric,
  available text,
  tour_url text,
  notes text,
  display_order integer DEFAULT 0
);

ALTER TABLE property_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_suites" ON property_suites FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_suites" ON property_suites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_suites" ON property_suites FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_suites" ON property_suites FOR DELETE TO authenticated USING (true);

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
CREATE POLICY "insert_brokers" ON brokers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_brokers" ON brokers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_brokers" ON brokers FOR DELETE TO authenticated USING (true);

-- Property-broker junction
CREATE TABLE IF NOT EXISTS property_brokers (
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES brokers(id) ON DELETE CASCADE,
  PRIMARY KEY (property_id, broker_id)
);

ALTER TABLE property_brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_property_brokers" ON property_brokers FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_property_brokers" ON property_brokers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_property_brokers" ON property_brokers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_property_brokers" ON property_brokers FOR DELETE TO authenticated USING (true);

-- User favorites table
CREATE TABLE IF NOT EXISTS user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, property_id)
);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_favorites" ON user_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_favorites" ON user_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_favorites" ON user_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Property notes table
CREATE TABLE IF NOT EXISTS property_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_notes" ON property_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_notes" ON property_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_notes" ON property_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_notes" ON property_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
