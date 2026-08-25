-- Fix client-logo uploads rejected by the storage write lockdown (migration 35).
--
-- That policy guarded against path traversal with:
--     (storage.foldername(name))[1] <> '..'
-- Client logos are stored at the bucket root ("acme-1699999999.png"), so
-- storage.foldername() returns an empty array, [1] is NULL, and NULL <> '..'
-- evaluates to NULL — which a WITH CHECK treats as failure. Every folderless
-- upload was therefore denied with "new row violates row-level security
-- policy". Only client logos were affected: every other upload goes through an
-- edge function on the service-role key, which bypasses RLS entirely.
--
-- Replaced with a NULL-safe check on the whole path, which blocks traversal
-- whether or not the object sits in a folder.

DROP POLICY IF EXISTS "app_buckets_admin_insert" ON storage.objects;
CREATE POLICY "app_buckets_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('property-photos', 'brochures', 'client-logos', 'property-documents')
    AND public.my_role() = 'admin'
    AND name NOT LIKE '%..%'
  );
