-- Drop overly permissive write policies and replace with admin-only (ECR email domain) checks.
-- Reads remain open to all authenticated users; writes are restricted to @ecrtx.com accounts.

-- ─── brokers ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_brokers" ON brokers;
DROP POLICY IF EXISTS "update_brokers" ON brokers;
DROP POLICY IF EXISTS "delete_brokers" ON brokers;

CREATE POLICY "insert_brokers" ON brokers FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "update_brokers" ON brokers FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_brokers" ON brokers FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- ─── clients ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_clients" ON clients;
DROP POLICY IF EXISTS "update_clients" ON clients;
DROP POLICY IF EXISTS "delete_clients" ON clients;

CREATE POLICY "insert_clients" ON clients FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "update_clients" ON clients FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_clients" ON clients FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- ─── client_brokers ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_client_brokers" ON client_brokers;
DROP POLICY IF EXISTS "delete_client_brokers" ON client_brokers;

CREATE POLICY "insert_client_brokers" ON client_brokers FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_client_brokers" ON client_brokers FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- ─── properties ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_properties" ON properties;
DROP POLICY IF EXISTS "update_properties" ON properties;
DROP POLICY IF EXISTS "delete_properties" ON properties;

CREATE POLICY "insert_properties" ON properties FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "update_properties" ON properties FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_properties" ON properties FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- ─── property_brokers ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_property_brokers" ON property_brokers;
DROP POLICY IF EXISTS "update_property_brokers" ON property_brokers;
DROP POLICY IF EXISTS "delete_property_brokers" ON property_brokers;

CREATE POLICY "insert_property_brokers" ON property_brokers FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "update_property_brokers" ON property_brokers FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_property_brokers" ON property_brokers FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

-- ─── property_suites ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_suites" ON property_suites;
DROP POLICY IF EXISTS "update_suites" ON property_suites;
DROP POLICY IF EXISTS "delete_suites" ON property_suites;

CREATE POLICY "insert_suites" ON property_suites FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "update_suites" ON property_suites FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');

CREATE POLICY "delete_suites" ON property_suites FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') LIKE '%@ecrtx.com');
