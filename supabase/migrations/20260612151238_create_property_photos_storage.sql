
-- Storage bucket for property photos (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "property_photos_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'property-photos');

CREATE POLICY "property_photos_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-photos');

CREATE POLICY "property_photos_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'property-photos')
  WITH CHECK (bucket_id = 'property-photos');

CREATE POLICY "property_photos_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'property-photos');

-- Table to track uploaded photos with ordering
CREATE TABLE property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_property_photos" ON property_photos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_property_photos" ON property_photos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "update_property_photos" ON property_photos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_property_photos" ON property_photos
  FOR DELETE TO authenticated USING (true);
