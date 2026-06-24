
-- Drop overly permissive write policies on shared/admin-managed tables.
-- Regular authenticated users should only READ these tables, not mutate them.

-- Properties: remove insert/update/delete for all authenticated users
DROP POLICY IF EXISTS "insert_properties" ON properties;
DROP POLICY IF EXISTS "update_properties" ON properties;
DROP POLICY IF EXISTS "delete_properties" ON properties;

-- Property suites: remove insert/update/delete for all authenticated users
DROP POLICY IF EXISTS "insert_suites" ON property_suites;
DROP POLICY IF EXISTS "update_suites" ON property_suites;
DROP POLICY IF EXISTS "delete_suites" ON property_suites;

-- Brokers: remove insert/update/delete for all authenticated users
DROP POLICY IF EXISTS "insert_brokers" ON brokers;
DROP POLICY IF EXISTS "update_brokers" ON brokers;
DROP POLICY IF EXISTS "delete_brokers" ON brokers;

-- Property-broker junction: remove insert/update/delete for all authenticated users
DROP POLICY IF EXISTS "insert_property_brokers" ON property_brokers;
DROP POLICY IF EXISTS "update_property_brokers" ON property_brokers;
DROP POLICY IF EXISTS "delete_property_brokers" ON property_brokers;
