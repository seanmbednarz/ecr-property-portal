-- Restrict storage writes to admins.
--
-- Every bucket was created with write policies granted to `authenticated`,
-- meaning ANY signed-in user — including a client login — could upload to or
-- delete from these buckets by calling the storage API directly. They couldn't
-- make a file appear in the app (the tables listing them are admin-only), but
-- a hostile or careless client could have deleted brochures and photos.
--
-- Safe against the app's real write paths:
--   * Uploads go through edge functions (upload-property-file, upload-brochure,
--     upload-broker-photo) which use the service-role key and bypass RLS.
--   * The direct client-side writes — client-logo upload on the Clients page,
--     photo and document deletes — are all behind admin-only UI.
--
-- Reads are unchanged: these are public buckets served by URL.

-- Clear out the permissive policies. Named-pattern match rather than a blanket
-- drop so Supabase's own internal storage policies are left alone.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname LIKE 'property_photos%'
        OR policyname LIKE 'brochures%'
        OR policyname LIKE 'client_logos%'
        OR policyname LIKE 'property_documents%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- Admin-only writes, one policy per verb across the four app buckets.
CREATE POLICY "app_buckets_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('property-photos', 'brochures', 'client-logos', 'property-documents')
    AND public.my_role() = 'admin'
    AND (storage.foldername(name))[1] <> '..'
  );

CREATE POLICY "app_buckets_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('property-photos', 'brochures', 'client-logos', 'property-documents')
    AND public.my_role() = 'admin'
  )
  WITH CHECK (
    bucket_id IN ('property-photos', 'brochures', 'client-logos', 'property-documents')
    AND public.my_role() = 'admin'
  );

CREATE POLICY "app_buckets_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('property-photos', 'brochures', 'client-logos', 'property-documents')
    AND public.my_role() = 'admin'
  );
