-- Per-client suite visibility: a suite tagged with client ids is only shown
-- to those clients; an empty array (the default) keeps it visible to every
-- client the property is assigned to. Lets one property serve multiple
-- clients with different availability instead of duplicating the property.
ALTER TABLE property_suites ADD COLUMN IF NOT EXISTS client_ids uuid[] NOT NULL DEFAULT '{}';
