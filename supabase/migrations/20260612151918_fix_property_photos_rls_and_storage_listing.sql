
-- Add ownership tracking to property_photos
ALTER TABLE property_photos ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop the always-true write policies
DROP POLICY "delete_property_photos" ON property_photos;
DROP POLICY "insert_property_photos" ON property_photos;
DROP POLICY "update_property_photos" ON property_photos;

-- Re-create with ownership checks
CREATE POLICY "insert_property_photos" ON property_photos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "update_property_photos" ON property_photos
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "delete_property_photos" ON property_photos
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- Fix storage listing: public buckets serve direct URLs without a SELECT policy;
-- restricting to authenticated prevents anonymous clients from calling list()
DROP POLICY "property_photos_public_read" ON storage.objects;

CREATE POLICY "property_photos_auth_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'property-photos');
