-- Make properties.updated_at actually mean "last updated".
--
-- The column has existed since the initial schema but only ever carried its
-- DEFAULT now() — nothing updated it on write, so it was really a created-at.
-- The detail page now surfaces it to readers, so it has to be true.
--
-- Two parts:
--   1. Touch properties.updated_at whenever the row itself changes.
--   2. Touch the PARENT property when its suites change, since editing a
--      suite (rent, availability, listing type) is an update to the property
--      as far as anyone reading the page is concerned.

CREATE OR REPLACE FUNCTION public.touch_property_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_properties ON properties;
CREATE TRIGGER trg_touch_properties
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_property_updated_at();

-- Suite writes bubble up to the parent property.
CREATE OR REPLACE FUNCTION public.touch_property_from_suite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.property_id, OLD.property_id);
  IF target IS NOT NULL THEN
    UPDATE properties SET updated_at = now() WHERE id = target;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_property_from_suite ON property_suites;
CREATE TRIGGER trg_touch_property_from_suite
  AFTER INSERT OR UPDATE OR DELETE ON property_suites
  FOR EACH ROW EXECUTE FUNCTION public.touch_property_from_suite();
