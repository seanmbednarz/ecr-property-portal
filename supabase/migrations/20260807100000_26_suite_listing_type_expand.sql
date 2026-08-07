-- Expand the per-suite listing type from lease|sale to four options:
-- lease, sublease, sale, coworking.
--
-- Pricing behaviour is unchanged: 'sale' is the only type that quotes a price
-- (base_rent read as price per SF, op_exp ignored, sale_price as the headline
-- override). 'sublease' and 'coworking' quote rent exactly like 'lease' — they
-- differ only in how the space is labelled to the reader.
--
-- Existing rows are all 'lease' or 'sale', so widening the constraint is
-- non-destructive and nothing needs backfilling.

DO $$
BEGIN
  ALTER TABLE property_suites
    DROP CONSTRAINT IF EXISTS property_suites_listing_type_check;
END $$;

ALTER TABLE property_suites
  ADD CONSTRAINT property_suites_listing_type_check
  CHECK (listing_type IN ('lease', 'sublease', 'sale', 'coworking'));
