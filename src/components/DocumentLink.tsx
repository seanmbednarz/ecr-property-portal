import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Landing point for the permanent document links printed in exported reports
// (/?doc=<id>). The documents bucket is private, so the report can't hold a
// working file URL — this looks the document up (RLS decides whether this user
// may see it), signs a short-lived URL and hands the browser over to it.

const BUCKET = 'property-documents';

export default function DocumentLink({ docId }: { docId: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: doc } = await supabase
        .from('property_documents')
        .select('storage_path')
        .eq('id', docId)
        .maybeSingle();
      const path = (doc as any)?.storage_path;
      const signed = path
        ? await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
        : null;
      if (cancelled) return;
      if (signed?.data?.signedUrl) window.location.replace(signed.data.signedUrl);
      else setFailed(true);
    })();
    return () => { cancelled = true; };
  }, [docId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ backgroundColor: '#1e2624', color: 'white' }}>
      {failed ? (
        <>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
            This document is no longer available, or your account doesn't have access to it.
          </p>
          <a href="/" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#d41f27' }}>
            Go to the portal
          </a>
        </>
      ) : (
        <>
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(136,152,147,0.2)', borderTopColor: '#d41f27' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>Opening document…</p>
        </>
      )}
    </div>
  );
}
