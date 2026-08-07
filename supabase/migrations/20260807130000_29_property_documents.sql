-- Property documents: drag-and-drop files shown at the bottom of a property
-- page, alongside the photo grid. Covers PDFs, Word, Excel, and images.
--
-- Mirrors property_photos (same storage-path + display_order shape) so the two
-- galleries behave the same way. Writes are admin-only, matching the rest of
-- the role lockdown in migration 23; reads follow property visibility so
-- clients see documents on their assigned properties.

CREATE TABLE IF NOT EXISTS property_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_documents_property_idx
  ON property_documents (property_id, display_order);

ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_property_documents ON property_documents;
CREATE POLICY sel_property_documents ON property_documents FOR SELECT TO authenticated
  USING (
    my_role() IN ('admin', 'broker')
    OR property_id IN (SELECT property_id FROM property_clients WHERE client_id = my_client_id())
  );

DROP POLICY IF EXISTS ins_property_documents ON property_documents;
CREATE POLICY ins_property_documents ON property_documents FOR INSERT TO authenticated
  WITH CHECK (my_role() = 'admin');

DROP POLICY IF EXISTS upd_property_documents ON property_documents;
CREATE POLICY upd_property_documents ON property_documents FOR UPDATE TO authenticated
  USING (my_role() = 'admin') WITH CHECK (my_role() = 'admin');

DROP POLICY IF EXISTS del_property_documents ON property_documents;
CREATE POLICY del_property_documents ON property_documents FOR DELETE TO authenticated
  USING (my_role() = 'admin');

-- Public bucket (same model as brochures/property-photos: the app links
-- straight to the public URL). 25 MB cap per file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-documents',
  'property-documents',
  true,
  26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE POLICY "property_documents_auth_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'property-documents' AND (storage.foldername(name))[1] <> '..');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "property_documents_auth_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'property-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "property_documents_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'property-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
