-- Drop the broad SELECT policy on storage.objects.
-- The bucket is public, so direct object URLs work without it.
-- The app reads photo paths from the property_photos table (own RLS policies)
-- and constructs URLs client-side via getPublicUrl() — no storage list() needed.
DROP POLICY IF EXISTS "property_photos_auth_read" ON storage.objects;