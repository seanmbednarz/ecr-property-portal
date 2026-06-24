-- Update properties SELECT policy so clients only see properties matching their client_id.
-- Admins and brokers (staff) see everything.
-- "Client" users are identified by having a profile with role='client' and a client_id set.
-- We check this via a join to the profiles table.

DROP POLICY IF EXISTS "select_properties" ON properties;

CREATE POLICY "select_properties" ON properties FOR SELECT
  TO authenticated
  USING (
    -- admins and brokers see all properties
    (auth.jwt() ->> 'email') LIKE '%@ecrtx.com'
    OR (
      -- check caller's profile role
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role IN ('admin', 'broker')
            OR (p.role = 'client' AND p.client_id = properties.client_id)
          )
      )
    )
  );

-- Also scope clients table: clients can only read their own record
DROP POLICY IF EXISTS "select_clients" ON clients;

CREATE POLICY "select_clients" ON clients FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') LIKE '%@ecrtx.com'
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'broker')
          OR (p.role = 'client' AND p.client_id = clients.id)
        )
    )
  );
