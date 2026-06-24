-- Update properties SELECT policy to check property_clients junction table
-- so client users can see properties assigned via the many-to-many relationship.
DROP POLICY IF EXISTS "select_properties" ON properties;

CREATE POLICY "select_properties" ON properties FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') LIKE '%@ecrtx.com'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'broker')
          OR (
            p.role = 'client'
            AND (
              p.client_id = properties.client_id
              OR EXISTS (
                SELECT 1 FROM property_clients pc
                WHERE pc.property_id = properties.id
                  AND pc.client_id = p.client_id
              )
            )
          )
        )
    )
  );
