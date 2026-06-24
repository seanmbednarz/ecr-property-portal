-- Allow admins and brokers (by profile role) to write properties,
-- in addition to the existing @ecrtx.com email check.

DROP POLICY IF EXISTS "insert_properties" ON properties;
DROP POLICY IF EXISTS "update_properties" ON properties;
DROP POLICY IF EXISTS "delete_properties" ON properties;

CREATE POLICY "insert_properties" ON properties FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  );

CREATE POLICY "update_properties" ON properties FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  );

CREATE POLICY "delete_properties" ON properties FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker')
    )
  );
