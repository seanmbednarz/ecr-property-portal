-- Multiple property types + a multi-value listing status per property.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS property_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS listing_status text[] NOT NULL DEFAULT '{}';

-- Seed from the existing single property_type and default existing listings to "For Lease".
UPDATE properties SET property_types = ARRAY[property_type]
  WHERE (property_types IS NULL OR property_types = '{}') AND property_type IS NOT NULL AND property_type <> '';

UPDATE properties SET listing_status = ARRAY['For Lease']::text[]
  WHERE listing_status IS NULL OR listing_status = '{}';
