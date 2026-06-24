import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getPropertyPhotos } from '../lib/placeholders';

export interface StoredPhoto {
  id: string;
  storage_path: string;
  display_order: number;
  url: string;
}

function publicUrl(path: string): string {
  return supabase.storage.from('property-photos').getPublicUrl(path).data.publicUrl;
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

  // Supabase photos take precedence; fall back to local bundled photos
  const photos = storedPhotos.length > 0 ? storedPhotos.map(p => p.url) : localPhotos;

  const upload = useCallback(
    async (files: File[]) => {
      setUploading(true);
      const nextOrder =
        storedPhotos.length > 0
          ? Math.max(...storedPhotos.map(p => p.display_order)) + 1
          : 0;

      const added: StoredPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('property-photos')
          .upload(path, file, { contentType: file.type });

        if (uploadError) continue;

        const { data, error } = await supabase
          .from('property_photos')
          .insert({
            property_id: propertyId,
            storage_path: path,
            display_order: nextOrder + i,
            created_by: (await supabase.auth.getUser()).data.user?.id,
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

  return { photos, storedPhotos, localPhotos, loading, uploading, upload, remove };
}
