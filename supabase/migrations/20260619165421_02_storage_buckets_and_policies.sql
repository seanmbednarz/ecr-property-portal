
-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brochures',
  'brochures',
  true,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for property-photos
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

-- Storage policies for brochures
CREATE POLICY "brochures_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brochures');

CREATE POLICY "brochures_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brochures');

CREATE POLICY "brochures_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brochures');
