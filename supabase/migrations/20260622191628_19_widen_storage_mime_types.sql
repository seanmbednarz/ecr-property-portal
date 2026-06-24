-- Widen allowed MIME types to cover all common variants the browser may send.
-- Also remove the restriction entirely at the bucket level and rely on frontend validation,
-- since content-type detection varies across browsers and OS.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/tiff', 'image/gif',
  'image/svg+xml', 'application/octet-stream'
]
WHERE id = 'property-photos';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  'application/octet-stream'
]
WHERE id = 'brochures';
