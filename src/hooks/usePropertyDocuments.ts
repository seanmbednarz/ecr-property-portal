import { useState, useEffect, useCallback } from 'react';
import { supabase, edgeFn } from '../lib/supabase';

// Documents attached to a property (PDF, Word, Excel, CSV, images). Mirrors
// usePropertyPhotos: same storage-path + display_order shape, same edge-function
// upload path, so the two galleries behave the same way. Unlike photos these
// are never resized — a spreadsheet is not an image.

export interface StoredDocument {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  display_order: number;
  url: string;
}

const BUCKET = 'property-documents';

// Kept in step with the bucket's allowed_mime_types (migration 29). Extensions
// are the practical check — browsers report inconsistent MIME types for Office
// files, especially on Windows.
export const DOCUMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'webp', 'gif',
];

export const MAX_DOCUMENT_BYTES = 26214400; // 25 MB, matches the bucket limit

// The bucket is private (migration 36), so links are signed and short-lived
// rather than permanent public URLs. Signed in one batch per page load; an
// hour comfortably outlives a visit to a property page.
const SIGNED_URL_TTL = 3600;

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error || !data) return out;
  data.forEach(row => {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  });
  return out;
}

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

async function uploadViaEdge(file: File, path: string, accessToken: string): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', BUCKET);
  form.append('path', path);
  const res = await fetch(
    edgeFn('upload-property-file'),
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? res.statusText);
  }
}

export function usePropertyDocuments(propertyId: string) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('property_documents')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });

    if (!err && data) {
      const rows = data as any[];
      const urls = await signedUrls(rows.map(r => r.storage_path));
      setDocuments(
        rows.map(r => ({
          id: r.id,
          storage_path: r.storage_path,
          file_name: r.file_name,
          mime_type: r.mime_type,
          size_bytes: r.size_bytes,
          display_order: r.display_order,
          // Empty when signing failed — the card renders without a working
          // link rather than silently pointing at a dead URL.
          url: urls.get(r.storage_path) ?? '',
        })),
      );
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setError(null);

      const nextOrder = documents.length > 0
        ? Math.max(...documents.map(d => d.display_order)) + 1
        : 0;

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';
      const userId = session?.user?.id ?? null;

      const added: string[] = [];
      const rejected: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = extensionOf(file.name);

        // Reject client-side with a named reason rather than letting the upload
        // fail opaquely against the bucket's own limits.
        if (!DOCUMENT_EXTENSIONS.includes(ext)) {
          rejected.push(`${file.name} (unsupported type)`);
          continue;
        }
        if (file.size > MAX_DOCUMENT_BYTES) {
          rejected.push(`${file.name} (over 25 MB)`);
          continue;
        }

        const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;
        try {
          await uploadViaEdge(file, path, accessToken);
        } catch (e: any) {
          rejected.push(`${file.name} (${e?.message ?? 'upload failed'})`);
          continue;
        }

        const { data, error: insErr } = await supabase
          .from('property_documents')
          .insert({
            property_id: propertyId,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            display_order: nextOrder + i,
            created_by: userId,
          })
          .select()
          .single();

        if (!insErr && data) {
          added.push(data.id);
        } else if (insErr) {
          rejected.push(`${file.name} (${insErr.message})`);
        }
      }

      // Refetch rather than appending locally: signed URLs have to come from
      // the storage API, so the list is rebuilt with valid links.
      if (added.length > 0) await fetchDocuments();
      setError(rejected.length ? `Couldn't add ${rejected.join(', ')}` : null);
      setUploading(false);
    },
    [propertyId, documents, fetchDocuments],
  );

  const remove = useCallback(
    async (docId: string) => {
      const doc = documents.find(d => d.id === docId);
      if (!doc) return;
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
      const { error: delErr } = await supabase.from('property_documents').delete().eq('id', docId);
      if (!delErr) setDocuments(prev => prev.filter(d => d.id !== docId));
    },
    [documents],
  );

  return { documents, loading, uploading, error, upload, remove, refetch: fetchDocuments };
}
