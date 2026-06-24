
-- Narrow storage SELECT policies from public to authenticated.
-- Public buckets serve objects via URL without needing a SELECT policy,
-- so restricting SELECT to authenticated prevents anonymous file listing
-- while keeping uploads working for logged-in users.

DROP POLICY IF EXISTS "property_photos_public_select" ON storage.objects;
DROP POLICY IF EXISTS "brochures_public_select" ON storage.objects;

CREATE POLICY "property_photos_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'property-photos');

CREATE POLICY "brochures_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'brochures');
