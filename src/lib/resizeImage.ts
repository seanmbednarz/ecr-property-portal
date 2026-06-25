// Downscale oversized raster photos in the browser before upload, so we never
// store multi-megabyte camera originals.
//
// Behaviour: resizes to FIT within maxW x maxH (aspect ratio preserved — no
// cropping, so nothing is cut off) and re-encodes as JPEG. Returns the ORIGINAL
// File untouched when it shouldn't/can't be processed: non-images, SVG/GIF
// (vector/animated — e.g. client logos), images already within bounds, or
// decode failures. When it does resize, the returned File is always a `.jpg`.
//
// Callers can detect "was resized" via reference identity: `result !== input`.

const MAX_W = 1920;
const MAX_H = 1080;
const QUALITY = 0.85;

export async function resizeImageForUpload(
  file: File,
  maxW: number = MAX_W,
  maxH: number = MAX_H,
  quality: number = QUALITY,
): Promise<File> {
  // Only re-encode raster images. Leave PDFs, SVGs (vector), and GIFs alone.
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif'
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // undecodable (e.g. some HEIC) — upload the original as-is
  }

  const { width, height } = bitmap;
  if (width <= maxW && height <= maxH) {
    bitmap.close();
    return file; // already small enough — don't recompress and lose quality
  }

  const scale = Math.min(maxW / width, maxH / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
