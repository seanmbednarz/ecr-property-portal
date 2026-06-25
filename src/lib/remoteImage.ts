import { supabase } from './supabase';
import { resizeImageForUpload } from './resizeImage';

const STORAGE_PREFIX = `${import.meta.env.VITE_SUPABASE_URL}/storage/`;

// A URL we should "internalize": an absolute http(s) link that isn't already in
// our own Supabase storage. (Our own storage URLs are left alone.)
export function isExternalUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\//i.test(url) && !url.startsWith(STORAGE_PREFIX);
}

function extForType(type: string): string {
  switch (type) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'image/svg+xml': return 'svg';
    case 'application/pdf': return 'pdf';
    default: return 'jpg';
  }
}

// Fetch a pasted external URL through our proxy edge function (server-side, to
// dodge browser CORS), resize it if it's an oversized image, then store it in
// our own bucket — so the saved record references our storage, not a third
// party that could break or rate-limit. Returns the new public URL.
export async function internalizeRemoteUrl(
  url: string,
  bucket: string,
  pathBase: string,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  // 1. Fetch the remote bytes via our proxy (browser can't read cross-origin).
  const proxyRes = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-image`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    },
  );
  if (!proxyRes.ok) {
    const j = await proxyRes.json().catch(() => ({}));
    throw new Error(j.error ?? `Could not fetch image (${proxyRes.status})`);
  }
  const blob = await proxyRes.blob();

  // 2. Resize oversized raster images (no-op for PDFs / already-small images).
  let file = new File([blob], 'remote', { type: blob.type || 'application/octet-stream' });
  file = await resizeImageForUpload(file);

  // 3. Store it in our bucket via the existing upload function.
  const path = `${pathBase}.${extForType(file.type)}`;
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  form.append('path', path);
  const upRes = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-property-file`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const upJson = await upRes.json().catch(() => ({}));
  if (!upRes.ok) throw new Error(upJson.error ?? 'Could not store image');
  return upJson.url as string;
}
