-- Public bucket for property brochures (PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brochures',
  'brochures',
  true,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- No SELECT policy needed — public bucket serves URLs directly.
-- Restrict write operations to service role only (no client uploads).
CREATE POLICY "brochures_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brochures' AND (storage.foldername(name))[1] != '..');

CREATE POLICY "brochures_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brochures');

CREATE POLICY "brochures_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'brochures');

-- Migrate brochure_url from relative path to full Supabase storage URL
UPDATE properties
SET brochure_url =
  'https://bzduqolubbtpavpvqzep.supabase.co/storage/v1/object/public/brochures/' ||
  substring(brochure_url FROM length('/brochures/') + 1)
WHERE brochure_url LIKE '/brochures/%';
