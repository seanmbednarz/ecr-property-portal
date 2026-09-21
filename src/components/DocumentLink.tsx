import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Landing point for the permanent document links carried by exported reports.
// The documents bucket is private, so a report can't hold a working file URL —
// this looks the documents up (RLS decides whether this user may see them) and
// signs short-lived URLs on the spot.
//
//   /?doc=<id>           one file: hand the browser straight over to it
//   /?docs=<propertyId>  every file on a property, as a list (the Excel report
//                        uses this when a property has more than one)

const BUCKET = 'property-documents';
const SIGNED_URL_TTL = 3600;

interface ListedDocument {
  name: string;
  url: string;
}

type Props = { docId: string; propertyId?: never } | { propertyId: string; docId?: never };

export default function DocumentLink({ docId, propertyId }: Props) {
  const [failed, setFailed] = useState(false);
  const [listing, setListing] = useState<{ property: string; documents: ListedDocument[] } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function openOne(id: string) {
      const { data: doc } = await supabase
        .from('property_documents')
        .select('storage_path')
        .eq('id', id)
        .maybeSingle();
      const path = (doc as any)?.storage_path;
      const signed = path
        ? await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
        : null;
      if (cancelled) return;
      if (signed?.data?.signedUrl) window.location.replace(signed.data.signedUrl);
      else setFailed(true);
    }

    async function list(id: string) {
      const [{ data: rows }, { data: property }] = await Promise.all([
        supabase
          .from('property_documents')
          .select('storage_path, file_name')
          .eq('property_id', id)
          .order('display_order', { ascending: true }),
        supabase.from('properties').select('name').eq('id', id).maybeSingle(),
      ]);
      const docs = (rows as any[] | null) ?? [];
      const signed = docs.length
        ? await supabase.storage.from(BUCKET).createSignedUrls(docs.map(d => d.storage_path), SIGNED_URL_TTL)
        : null;
      if (cancelled) return;
      const urls = new Map((signed?.data ?? []).map(s => [s.path, s.signedUrl]));
      const documents = docs
        .map(d => ({ name: d.file_name as string, url: urls.get(d.storage_path) ?? '' }))
        .filter(d => d.url);
      if (documents.length === 0) setFailed(true);
      else setListing({ property: (property as any)?.name ?? 'Property', documents });
    }

    if (docId) openOne(docId);
    else if (propertyId) list(propertyId);
    return () => { cancelled = true; };
  }, [docId, propertyId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ backgroundColor: '#1e2624', color: 'white' }}>
      {failed ? (
        <>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {docId ? 'This document is' : 'These documents are'} no longer available, or your account doesn't have access.
          </p>
          <a href="/" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#d41f27' }}>
            Go to the portal
          </a>
        </>
      ) : listing ? (
        <div className="w-full max-w-md text-left">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Documents</p>
          <h1 className="text-2xl font-bold mt-1 mb-5">{listing.property}</h1>
          <div className="flex flex-col gap-2">
            {listing.documents.map((d, i) => (
              <a
                key={i}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium break-all"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <FileText size={16} className="shrink-0" style={{ color: '#d41f27' }} />
                {d.name}
              </a>
            ))}
          </div>
          <a href="/" className="inline-block mt-6 text-sm underline" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Go to the portal
          </a>
        </div>
      ) : (
        <>
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(136,152,147,0.2)', borderTopColor: '#d41f27' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>Opening…</p>
        </>
      )}
    </div>
  );
}
