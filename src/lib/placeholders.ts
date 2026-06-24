const IMAGES = [
  'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1170412/pexels-photo-1170412.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/2883049/pexels-photo-2883049.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1370704/pexels-photo-1370704.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/221540/pexels-photo-221540.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1367269/pexels-photo-1367269.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/273209/pexels-photo-273209.jpeg?auto=compress&cs=tinysrgb&w=1200',
];

export function propertyPlaceholder(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return IMAGES[Math.abs(hash) % IMAGES.length];
}

export { IMAGES as PLACEHOLDER_IMAGES };

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

// Eagerly import all property photos from src/assets/property-photos/**
const rawPhotos = import.meta.glob<{ default: string }>(
  '../assets/property-photos/**/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG}',
  { eager: true }
);

function buildPropertyPhotos(): Record<string, string[]> {
  const groups: Record<string, { n: number; url: string }[]> = {};
  for (const [path, mod] of Object.entries(rawPhotos)) {
    // path: ../assets/property-photos/<property-id>/<property-id>-N.jpg
    const segments = path.split('/');
    const folder = segments[segments.length - 2];
    const filename = segments[segments.length - 1];
    const match = filename.match(/-(\d+)\.[^.]+$/);
    const n = match ? parseInt(match[1], 10) : 999;
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push({ n, url: mod.default });
  }
  const result: Record<string, string[]> = {};
  for (const [folder, items] of Object.entries(groups)) {
    result[folder] = items.sort((a, b) => a.n - b.n).map(i => i.url);
  }
  return result;
}

const PROPERTY_PHOTOS = buildPropertyPhotos();

export function getPropertyPhotos(propertyId: string): string[] {
  return PROPERTY_PHOTOS[propertyId] ?? [];
}
