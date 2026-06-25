export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Properties now use real uploaded photos from storage. The old demo bundled
// placeholder images from src/assets, which couldn't be managed/deleted in the
// UI — so there are no local placeholders anymore.
export function getPropertyPhotos(_slug: string): string[] {
  return [];
}
