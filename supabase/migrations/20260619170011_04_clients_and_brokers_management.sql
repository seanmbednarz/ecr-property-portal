
-- Add login_password to brokers (display only, not Supabase auth)
ALTER TABLE brokers ADD COLUMN IF NOT EXISTS login_password text DEFAULT 'broker';

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text NOT NULL,
  email text,
  login_password text,
  website text,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_clients" ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_clients" ON clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_clients" ON clients FOR DELETE TO authenticated USING (true);

-- Client-broker junction
CREATE TABLE IF NOT EXISTS client_brokers (
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  broker_id uuid REFERENCES brokers(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, broker_id)
);

ALTER TABLE client_brokers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_client_brokers" ON client_brokers FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_client_brokers" ON client_brokers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete_client_brokers" ON client_brokers FOR DELETE TO authenticated USING (true);

-- Add client_id FK to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
