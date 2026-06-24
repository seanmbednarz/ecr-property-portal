
-- Dedicated bucket for client logos, supporting all common image formats.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-logos',
  'client-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "client_logos_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'client-logos');

CREATE POLICY "client_logos_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'client-logos');

CREATE POLICY "client_logos_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'client-logos')
  WITH CHECK (bucket_id = 'client-logos');

CREATE POLICY "client_logos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'client-logos');
