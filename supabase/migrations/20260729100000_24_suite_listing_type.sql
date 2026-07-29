-- Per-suite lease/sale split. A property can be marketed for sale while still
-- quoting some spaces for lease (and vice versa), so the lease-vs-sale choice
-- lives on the suite, not the property. 'lease' is the default so every
-- existing suite keeps rendering exactly as it does today.
--
-- For a sale suite base_rent is read as price per SF and op_exp is ignored;
-- sale_price is an optional override for the headline price when it isn't
-- simply base_rent × sf (mirrors how full_svc/monthly_rent override the
-- computed lease numbers).
ALTER TABLE property_suites
  ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'lease',
  ADD COLUMN IF NOT EXISTS sale_price numeric;

DO $$
BEGIN
  ALTER TABLE property_suites
    ADD CONSTRAINT property_suites_listing_type_check
    CHECK (listing_type IN ('lease', 'sale'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
