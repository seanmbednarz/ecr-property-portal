-- Role-based access lockdown.
-- Before this, every table granted SELECT/INSERT/UPDATE/DELETE to any
-- authenticated user — the app's role gating was UI-only. This enforces:
--   admin  : full read/write everywhere
--   broker : read-only on properties/suites/photos; sees ONLY their own
--            assigned clients; cannot write anything
--   client : sees only their assigned properties (suites also filtered by
--            per-suite client_ids), their own client row, and the brokers;
--            can only write their own favorites and notes (those tables
--            already had own-row policies and are untouched)
-- Also drops the plaintext login_password columns; Supabase Auth holds the
-- real (hashed) credentials, so nothing breaks.

-- Helper functions: SECURITY DEFINER so policies can read profiles /
-- client_brokers without recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT role FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.my_client_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT client_id FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.my_broker_clients() RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT coalesce(array_agg(client_id), '{}') FROM client_brokers
   WHERE broker_id = (SELECT broker_id FROM profiles WHERE id = auth.uid()) $$;

-- Drop every existing policy on the tables being re-secured
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN
      ('properties','property_suites','property_photos','property_brokers',
       'brokers','clients','client_brokers','property_clients')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- PROPERTIES: admins/brokers read all; clients read assigned; admin writes
CREATE POLICY sel_properties ON properties FOR SELECT TO authenticated
  USING (my_role() IN ('admin','broker')
         OR id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id()));
CREATE POLICY ins_properties ON properties FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_properties ON properties FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_properties ON properties FOR DELETE TO authenticated USING (my_role() = 'admin');

-- PROPERTY_CLIENTS: clients see their own assignment rows
CREATE POLICY sel_property_clients ON property_clients FOR SELECT TO authenticated
  USING (my_role() IN ('admin','broker') OR client_id = my_client_id());
CREATE POLICY ins_property_clients ON property_clients FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY del_property_clients ON property_clients FOR DELETE TO authenticated USING (my_role() = 'admin');

-- PROPERTY_SUITES: clients see suites of assigned properties, and only
-- suites untagged or tagged for them (DB-enforced per-client visibility)
CREATE POLICY sel_property_suites ON property_suites FOR SELECT TO authenticated
  USING (my_role() IN ('admin','broker')
         OR (property_id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id())
             AND (coalesce(cardinality(client_ids), 0) = 0 OR my_client_id() = ANY(client_ids))));
CREATE POLICY ins_property_suites ON property_suites FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_property_suites ON property_suites FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_property_suites ON property_suites FOR DELETE TO authenticated USING (my_role() = 'admin');

-- PROPERTY_PHOTOS: same visibility as the property; admin writes
CREATE POLICY sel_property_photos ON property_photos FOR SELECT TO authenticated
  USING (my_role() IN ('admin','broker')
         OR property_id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id()));
CREATE POLICY ins_property_photos ON property_photos FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_property_photos ON property_photos FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_property_photos ON property_photos FOR DELETE TO authenticated USING (my_role() = 'admin');

-- PROPERTY_BROKERS: same visibility as the property; admin writes
CREATE POLICY sel_property_brokers ON property_brokers FOR SELECT TO authenticated
  USING (my_role() IN ('admin','broker')
         OR property_id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id()));
CREATE POLICY ins_property_brokers ON property_brokers FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY del_property_brokers ON property_brokers FOR DELETE TO authenticated USING (my_role() = 'admin');

-- BROKERS: readable by everyone signed in (footers/branding); admin writes
CREATE POLICY sel_brokers ON brokers FOR SELECT TO authenticated USING (true);
CREATE POLICY ins_brokers ON brokers FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_brokers ON brokers FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_brokers ON brokers FOR DELETE TO authenticated USING (my_role() = 'admin');

-- CLIENTS: admin all; broker only their assigned clients; client own row
CREATE POLICY sel_clients ON clients FOR SELECT TO authenticated
  USING (my_role() = 'admin'
         OR (my_role() = 'broker' AND id = ANY(my_broker_clients()))
         OR id = my_client_id());
CREATE POLICY ins_clients ON clients FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_clients ON clients FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_clients ON clients FOR DELETE TO authenticated USING (my_role() = 'admin');

-- CLIENT_BROKERS: broker sees links for their clients; client their own
CREATE POLICY sel_client_brokers ON client_brokers FOR SELECT TO authenticated
  USING (my_role() = 'admin'
         OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients()))
         OR client_id = my_client_id());
CREATE POLICY ins_client_brokers ON client_brokers FOR INSERT TO authenticated WITH CHECK (my_role() = 'admin');
CREATE POLICY upd_client_brokers ON client_brokers FOR UPDATE TO authenticated USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');
CREATE POLICY del_client_brokers ON client_brokers FOR DELETE TO authenticated USING (my_role() = 'admin');

-- No more plaintext passwords (Supabase Auth keeps the real hashed ones)
ALTER TABLE clients DROP COLUMN IF EXISTS login_password;
ALTER TABLE brokers DROP COLUMN IF EXISTS login_password;
