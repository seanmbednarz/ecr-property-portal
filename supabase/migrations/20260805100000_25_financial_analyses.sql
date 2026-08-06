-- Financial Analysis persistence (Phase 2).
--
-- Stores one saved deal analysis per client so it follows the client to their
-- own login, instead of living in whichever browser the broker used.
--
-- Shape: the analysis is held as a JSON document rather than normalised into
-- deals/options/stages/periods tables. It is authored as a whole, saved as a
-- whole, and read as a whole; nothing queries across deals. Normalising would
-- add four tables and a lot of joins for no behaviour we need today.
--
-- ACCESS MODEL — note the deliberate departure from the rest of the schema:
-- elsewhere brokers are read-only and only admins write. Here brokers CAN
-- write, but strictly for the clients assigned to them, because this table
-- holds broker-authored work. Clients remain strictly read-only: they can see
-- their own analysis and nothing else, and can never modify it.

CREATE TABLE IF NOT EXISTS financial_analyses (
  -- One analysis per client; re-saving replaces it.
  client_id       uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  -- deals, chosen stage per term option, display settings, NPV rate, notes
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The originally uploaded workbook, so anyone can re-download it.
  -- Kept in a separate column and fetched only on demand: it is far larger
  -- than `data` and would otherwise be pulled on every page load.
  workbook_name   text,
  workbook_base64 text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE financial_analyses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON financial_analyses TO authenticated;

-- Read: admins everywhere; brokers for their assigned clients; clients their own.
CREATE POLICY sel_financial_analyses ON financial_analyses FOR SELECT TO authenticated
  USING (my_role() = 'admin'
         OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients()))
         OR client_id = my_client_id());

-- Write: admins, and brokers for their own clients. Clients are never allowed.
CREATE POLICY ins_financial_analyses ON financial_analyses FOR INSERT TO authenticated
  WITH CHECK (my_role() = 'admin'
              OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients())));

CREATE POLICY upd_financial_analyses ON financial_analyses FOR UPDATE TO authenticated
  USING (my_role() = 'admin'
         OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients())))
  WITH CHECK (my_role() = 'admin'
              OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients())));

CREATE POLICY del_financial_analyses ON financial_analyses FOR DELETE TO authenticated
  USING (my_role() = 'admin'
         OR (my_role() = 'broker' AND client_id = ANY(my_broker_clients())));

-- Keep updated_at honest without relying on the client to send it.
CREATE OR REPLACE FUNCTION public.touch_financial_analyses() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_financial_analyses ON financial_analyses;
CREATE TRIGGER trg_touch_financial_analyses
  BEFORE UPDATE ON financial_analyses
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_analyses();
