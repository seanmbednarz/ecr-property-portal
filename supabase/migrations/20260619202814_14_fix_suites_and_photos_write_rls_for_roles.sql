-- Extend property_suites and property_photos write policies to allow
-- admin/broker profile roles in addition to @ecrtx.com emails.

DROP POLICY IF EXISTS "insert_suites" ON property_suites;
DROP POLICY IF EXISTS "update_suites" ON property_suites;
DROP POLICY IF EXISTS "delete_suites" ON property_suites;

CREATE POLICY "insert_suites" ON property_suites FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );

CREATE POLICY "update_suites" ON property_suites FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  )
  WITH CHECK (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );

CREATE POLICY "delete_suites" ON property_suites FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );

-- property_photos: allow admin/broker to insert (created_by can be their uid)
DROP POLICY IF EXISTS "insert_property_photos" ON property_photos;
DROP POLICY IF EXISTS "update_property_photos" ON property_photos;
DROP POLICY IF EXISTS "delete_property_photos" ON property_photos;

CREATE POLICY "insert_property_photos" ON property_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    OR (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );

CREATE POLICY "update_property_photos" ON property_photos FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  )
  WITH CHECK (
    auth.uid() = created_by
    OR (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );

CREATE POLICY "delete_property_photos" ON property_photos FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR (auth.jwt() ->> 'email' LIKE '%@ecrtx.com')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'broker'))
  );
