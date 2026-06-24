-- Many-to-many: properties can belong to multiple clients
CREATE TABLE IF NOT EXISTS property_clients (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
  PRIMARY KEY (property_id, client_id)
);

ALTER TABLE property_clients ENABLE ROW LEVEL SECURITY;

-- Migrate existing single client_id assignments
INSERT INTO property_clients (property_id, client_id)
SELECT id, client_id
FROM properties
WHERE client_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS: anyone authenticated can read
CREATE POLICY "select_property_clients" ON property_clients FOR SELECT
  TO authenticated USING (true);

-- RLS: only admins/brokers can write
CREATE POLICY "insert_property_clients" ON property_clients FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  );

CREATE POLICY "delete_property_clients" ON property_clients FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  );
