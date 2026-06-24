
-- Remove broad SELECT policies from all storage buckets.
-- Public URL serving bypasses RLS entirely; our code only uses getPublicUrl()
-- and upload(), neither of which requires a SELECT policy on storage.objects.
DROP POLICY IF EXISTS "property_photos_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "brochures_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "client_logos_auth_select" ON storage.objects;
