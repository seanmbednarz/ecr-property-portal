import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getPropertyPhotos } from '../lib/placeholders';
import { resizeImageForUpload } from '../lib/resizeImage';

export interface StoredPhoto {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
}

function publicUrl(path: string): string {
  return supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl;
}

async function uploadViaEdge(file: File, path: string, accessToken: string): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', 'property-photos');
  form.append('path', path);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-property-file`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? res.statusText);
  }
}

export function usePropertyPhotos(propertyId: string, slug: string) {
  const [storedPhotos, setStoredPhotos] = useState<StoredPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const localPhotos = getPropertyPhotos(slug);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('property_photos')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });

    if (!error && data) {
      setStoredPhotos(
        data.map((r: any) => ({
          id: r.id,
          storage_path: r.storage_path,
          display_order: r.display_order,
          url: publicUrl(r.storage_path),
        })),
      );
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Floor plans live in the same table under a "floorplans/" path; keep them out
  // of the regular photo gallery and expose them separately. storedPhotos stays
  // the full set so deletion (by url) still maps either kind.
  const galleryPhotos = storedPhotos.filter(p => !p.storage_path.includes('floorplans/'));
  const floorPlanUrls = storedPhotos.filter(p => p.storage_path.includes('floorplans/')).map(p => p.url);

  // Supabase photos take precedence; local photos are appended after stored ones
  // (deduplication not needed — local and storage URLs are always different)
  const photos = galleryPhotos.length > 0
    ? [...galleryPhotos.map(p => p.url), ...localPhotos]
    : localPhotos;

  const upload = useCallback(
    async (files: File[]) => {
      setUploading(true);
      const nextOrder =
        storedPhotos.length > 0
          ? Math.max(...storedPhotos.map(p => p.display_order)) + 1
          : 0;

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';
      const userId = session?.user?.id ?? null;

      const added: StoredPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = await resizeImageForUpload(files[i]);
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;

        try {
          await uploadViaEdge(file, path, accessToken);
        } catch {
          continue;
        }

        const { data, error } = await supabase
          .from('property_photos')
          .insert({
            property_id: propertyId,
            storage_path: path,
            display_order: nextOrder + i,
            created_by: userId,
          })
          .select()
          .single();

        if (!error && data) {
          added.push({
            id: data.id,
            storage_path: data.storage_path,
            display_order: data.display_order,
            url: publicUrl(path),
          });
        }
      }

      setStoredPhotos(prev => [...prev, ...added]);
      setUploading(false);
    },
    [propertyId, storedPhotos],
  );

  const remove = useCallback(
    async (photoId: string) => {
      const photo = storedPhotos.find(p => p.id === photoId);
      if (!photo) return;
      await supabase.storage.from('property-photos').remove([photo.storage_path]);
      await supabase.from('property_photos').delete().eq('id', photoId);
      setStoredPhotos(prev => prev.filter(p => p.id !== photoId));
    },
    [storedPhotos],
  );

  return { photos, floorPlanUrls, storedPhotos, localPhotos, loading, uploading, upload, remove };
}
