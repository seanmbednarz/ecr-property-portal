
-- Public SELECT on storage objects for both buckets.
-- Required for Supabase JS client uploads to succeed (the client does a
-- SELECT after INSERT to confirm the object exists). Without this the
-- upload call returns no error but the file is never written.

CREATE POLICY "property_photos_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'property-photos');

CREATE POLICY "brochures_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'brochures');
