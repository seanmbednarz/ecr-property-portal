-- Make property documents private.
--
-- The bucket was public, so every uploaded lease, financial or spreadsheet sat
-- behind a permanent unauthenticated URL: anyone who was ever forwarded a link
-- could open it forever, with no login and no way to revoke it.
--
-- The bucket is now private and the app hands out short-lived signed URLs
-- generated per page load. Creating a signed URL requires SELECT on the
-- object, so the read policy below is what actually decides who can see a
-- document — it mirrors the property_documents table policy.
--
-- Brochures, property photos and client logos are deliberately left public:
-- they're marketing collateral, and brochure links are embedded as live
-- hyperlinks inside the Excel and PDF reports we send clients. Expiring those
-- would break reports already in clients' hands.

UPDATE storage.buckets SET public = false WHERE id = 'property-documents';

-- Documents are stored at "<property_id>/<uuid>.<ext>", so the first path
-- segment identifies the property. Compared as text rather than cast to uuid —
-- a cast would raise on any unexpected path instead of just denying it.
DROP POLICY IF EXISTS "property_documents_read" ON storage.objects;
CREATE POLICY "property_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-documents'
    AND (
      public.my_role() IN ('admin', 'broker')
      OR (storage.foldername(name))[1] IN (
        SELECT property_id::text FROM property_clients WHERE client_id = public.my_client_id()
      )
    )
  );
