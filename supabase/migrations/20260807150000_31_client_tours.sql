-- Persist tour itineraries in the database instead of the browser, so a tour
-- built at a desk can be pulled up on a phone during the tour itself.
--
-- One active tour per client. Stops are stored as JSONB rather than a child
-- table because a tour is edited as a whole document (reorder, add, remove)
-- and always loaded in full — a join buys nothing here. Shape:
--   [{ "propertyId": "<uuid>", "time": "09:30" }, ...]
-- Order in the array IS the tour order.
--
-- Deleted or reassigned properties are tolerated: the UI resolves each id
-- against the properties the viewer can actually see and skips the rest.

CREATE TABLE IF NOT EXISTS client_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_tours ENABLE ROW LEVEL SECURITY;

-- Read: staff see any tour they can reach; a client sees only their own.
DROP POLICY IF EXISTS sel_client_tours ON client_tours;
CREATE POLICY sel_client_tours ON client_tours FOR SELECT TO authenticated
  USING (
    my_role() = 'admin'
    OR (my_role() = 'broker' AND client_id = ANY (my_broker_clients()))
    OR client_id = my_client_id()
  );

-- Write: admins anywhere, brokers only for their own assigned clients.
-- Clients are deliberately read-only — the itinerary is the broker's document.
DROP POLICY IF EXISTS ins_client_tours ON client_tours;
CREATE POLICY ins_client_tours ON client_tours FOR INSERT TO authenticated
  WITH CHECK (
    my_role() = 'admin'
    OR (my_role() = 'broker' AND client_id = ANY (my_broker_clients()))
  );

DROP POLICY IF EXISTS upd_client_tours ON client_tours;
CREATE POLICY upd_client_tours ON client_tours FOR UPDATE TO authenticated
  USING (
    my_role() = 'admin'
    OR (my_role() = 'broker' AND client_id = ANY (my_broker_clients()))
  )
  WITH CHECK (
    my_role() = 'admin'
    OR (my_role() = 'broker' AND client_id = ANY (my_broker_clients()))
  );

DROP POLICY IF EXISTS del_client_tours ON client_tours;
CREATE POLICY del_client_tours ON client_tours FOR DELETE TO authenticated
  USING (
    my_role() = 'admin'
    OR (my_role() = 'broker' AND client_id = ANY (my_broker_clients()))
  );

-- Keep updated_at honest; the UI shows when the itinerary last changed.
CREATE OR REPLACE FUNCTION public.touch_client_tours()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_client_tours ON client_tours;
CREATE TRIGGER trg_touch_client_tours
  BEFORE UPDATE ON client_tours
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_tours();
