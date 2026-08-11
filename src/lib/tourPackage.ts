import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { Property, Broker } from '../types';
import { formatAddress } from './geocode';
import { isSaleSuite, salePriceOf } from './propertyMeta';

// Optional cover photo. Resolved with import.meta.glob rather than a direct
// import so the build still succeeds when the file isn't there — drop an image
// at src/assets/tour-cover.(jpg|jpeg|png) and it appears on the next build.
const coverPhotoModules = import.meta.glob('../assets/tour-cover.{jpg,jpeg,png}', {
  eager: true, query: '?url', import: 'default',
});
const COVER_PHOTO_URL = (Object.values(coverPhotoModules)[0] as string | undefined) ?? null;

// Assembles the full tour package as a single PDF: cover, schedule, map with a
// numbered legend, then each property's flyer in tour order.
//
// Flyers are existing PDFs in Supabase storage, so they're merged page-for-page
// rather than re-rendered — the client gets the real marketing material, not a
// screenshot of it. Anything that can't be merged is reported back rather than
// silently dropped, so the broker knows what's missing before they send it.

const LETTER: [number, number] = [612, 792];
const MARGIN = 48;

const ECR_RED = rgb(212 / 255, 31 / 255, 39 / 255);
const INK = rgb(30 / 255, 38 / 255, 36 / 255);
const MUTED = rgb(122 / 255, 138 / 255, 135 / 255);
const RULE = rgb(229 / 255, 225 / 255, 216 / 255);
const BAND = rgb(245 / 255, 242 / 255, 236 / 255);
const DARK = rgb(42 / 255, 51 / 255, 48 / 255);

export interface TourPackageStop {
  property: Property;
  time: string;
}

export interface TourPackageInput {
  clientName: string;
  clientLogoUrl: string | null;
  ecrLogoUrl: string;
  tourDate: string;          // ISO yyyy-mm-dd
  tourDateLabel: string;     // already formatted for display
  stops: TourPackageStop[];
  brokers: Broker[];
  mapImageDataUrl: string;   // PNG data URL captured from the live map
  formatTime: (hhmm: string) => string;
}

export interface TourPackageResult {
  blob: Blob;
  fileName: string;
  flyersIncluded: string[];
  flyersMissing: string[];   // no flyer on file
  flyersFailed: string[];    // flyer exists but couldn't be merged
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Normalises any browser-renderable image (SVG, WebP, JPEG…) to PNG bytes,
// because pdf-lib only embeds PNG and JPEG. Returns null rather than throwing:
// a missing logo should never cost the broker the whole package.
async function imageToPngBytes(url: string): Promise<Uint8Array | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });
    // SVGs often report 0 natural size; fall back to a sane raster box.
    const w = img.naturalWidth || 600;
    const h = img.naturalHeight || 200;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return dataUrlToBytes(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawFooter(page: PDFPage, font: PDFFont) {
  page.drawText('ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 // ecrtx.com', {
    x: MARGIN, y: 28, size: 7.5, font, color: MUTED,
  });
  page.drawText('BUILT ON RELATIONSHIPS.', {
    x: LETTER[0] - MARGIN - font.widthOfTextAtSize('BUILT ON RELATIONSHIPS.', 7.5),
    y: 28, size: 7.5, font, color: ECR_RED,
  });
}

export async function buildTourPackage(input: TourPackageInput): Promise<TourPackageResult> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const flyersIncluded: string[] = [];
  const flyersMissing: string[] = [];
  const flyersFailed: string[] = [];

  // ── 1. Cover ──────────────────────────────────────────────────────────────
  {
    const page = pdf.addPage(LETTER);
    const { width, height } = page.getSize();

    const BAND_H = 96;
    const PHOTO_H = 268;

    // Photo first, then the band and logos paint over it — drawing in z-order
    // avoids re-drawing the logos to cover photo overflow.
    let photoBottom = height - BAND_H;
    if (COVER_PHOTO_URL) {
      const photoBytes = await imageToPngBytes(COVER_PHOTO_URL);
      if (photoBytes) {
        try {
          const photo = await pdf.embedPng(photoBytes);
          const yPos = height - BAND_H - PHOTO_H;
          // Cover-fit: fill the width and let the excess height run under the
          // band above and the white mask below.
          const drawW = width;
          const drawH = (photo.height / photo.width) * drawW;
          page.drawImage(photo, {
            x: 0, y: yPos - (drawH - PHOTO_H) / 2, width: drawW, height: drawH,
          });
          // Mask whatever spills below the intended band.
          page.drawRectangle({ x: 0, y: 0, width, height: yPos, color: rgb(1, 1, 1) });
          photoBottom = yPos;
        } catch {
          // Unsupported image — the cover still works without it.
        }
      }
    }

    // Dark header band. Client logos are usually light (they're made for the
    // app's dark header), so on white they'd wash out — the band gives them
    // the background they were designed for.
    page.drawRectangle({ x: 0, y: height - BAND_H, width, height: BAND_H, color: DARK });

    const ecrBytes = await imageToPngBytes(input.ecrLogoUrl);
    if (ecrBytes) {
      const logo = await pdf.embedPng(ecrBytes);
      const w = 104;
      const h = (logo.height / logo.width) * w;
      page.drawImage(logo, { x: MARGIN, y: height - BAND_H / 2 - h / 2, width: w, height: h });
    }

    if (input.clientLogoUrl) {
      const clientBytes = await imageToPngBytes(input.clientLogoUrl);
      if (clientBytes) {
        const logo = await pdf.embedPng(clientBytes);
        const scale = Math.min(130 / logo.width, 54 / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;
        page.drawImage(logo, {
          x: width - MARGIN - w, y: height - BAND_H / 2 - h / 2, width: w, height: h,
        });
      }
    }

    let y = photoBottom - 86;
    page.drawRectangle({ x: MARGIN, y: y + 46, width: 64, height: 4, color: ECR_RED });

    page.drawText('PROPERTY TOUR', { x: MARGIN, y, size: 34, font: bold, color: INK });
    y -= 30;

    if (input.clientName) {
      page.drawText(truncate(input.clientName, font, 18, width - MARGIN * 2), {
        x: MARGIN, y, size: 18, font, color: MUTED,
      });
      y -= 30;
    }

    if (input.tourDateLabel) {
      page.drawText(input.tourDateLabel, { x: MARGIN, y, size: 14, font: bold, color: ECR_RED });
      y -= 24;
    }

    const stopCount = input.stops.length;
    page.drawText(`${stopCount} ${stopCount === 1 ? 'property' : 'properties'}`, {
      x: MARGIN, y, size: 11, font, color: MUTED,
    });

    // Broker block, bottom-left above the footer.
    if (input.brokers.length > 0) {
      let by = 150;
      page.drawText('PREPARED BY', { x: MARGIN, y: by, size: 8, font: bold, color: MUTED });
      by -= 8;
      page.drawLine({
        start: { x: MARGIN, y: by }, end: { x: width - MARGIN, y: by },
        thickness: 0.75, color: RULE,
      });
      by -= 18;

      // Two per row so a full broker team still fits above the footer.
      const colW = (width - MARGIN * 2) / 2;
      input.brokers.slice(0, 4).forEach((b, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = MARGIN + col * colW;
        const rowY = by - row * 40;
        page.drawText(truncate(b.name, bold, 11, colW - 12), { x: bx, y: rowY, size: 11, font: bold, color: INK });
        const detail = [b.title, b.phone].filter(Boolean).join(' · ');
        if (detail) {
          page.drawText(truncate(detail, font, 8.5, colW - 12), { x: bx, y: rowY - 12, size: 8.5, font, color: MUTED });
        }
        if (b.email) {
          page.drawText(truncate(b.email, font, 8.5, colW - 12), { x: bx, y: rowY - 23, size: 8.5, font, color: MUTED });
        }
      });
    }

    drawFooter(page, font);
  }

  // ── 2. Schedule ───────────────────────────────────────────────────────────
  // A card per stop rather than one thin row: the useful detail (size,
  // submarket, and every quoted suite) doesn't fit a single line, and the
  // broker is reading this standing in a lobby.
  {
    let page = pdf.addPage(LETTER);
    const { width, height } = page.getSize();
    let y = height - MARGIN;

    const newPage = () => {
      drawFooter(page, font);
      page = pdf.addPage(LETTER);
      y = height - MARGIN;
    };

    page.drawText('TOUR SCHEDULE', { x: MARGIN, y, size: 16, font: bold, color: INK });
    page.drawLine({ start: { x: MARGIN, y: y - 12 }, end: { x: width - MARGIN, y: y - 12 }, thickness: 2, color: ECR_RED });
    y -= 22;
    if (input.tourDateLabel) {
      page.drawText(input.tourDateLabel, { x: MARGIN, y, size: 10, font, color: MUTED });
      y -= 10;
    }
    y -= 20;

    const innerW = width - MARGIN * 2;

    input.stops.forEach((s, i) => {
      const suites = s.property.suites ?? [];
      // Header + meta + suite header + rows, or a single "no suites" line.
      const cardH = 52 + (suites.length ? 16 + suites.length * 14 : 12) + 12;
      if (y - cardH < 70) newPage();

      const top = y;
      page.drawRectangle({ x: MARGIN, y: top - cardH, width: innerW, height: cardH, color: BAND });
      page.drawRectangle({ x: MARGIN, y: top - cardH, width: 3, height: cardH, color: ECR_RED });

      // Stop badge + time
      page.drawCircle({ x: MARGIN + 22, y: top - 18, size: 11, color: DARK });
      const numTxt = String(i + 1);
      page.drawText(numTxt, {
        x: MARGIN + 22 - bold.widthOfTextAtSize(numTxt, 10) / 2, y: top - 21.5,
        size: 10, font: bold, color: rgb(1, 1, 1),
      });
      page.drawText(input.formatTime(s.time), {
        x: MARGIN + 40, y: top - 22, size: 12, font: bold, color: ECR_RED,
      });
      page.drawText(truncate(s.property.name, bold, 12, innerW - 150), {
        x: MARGIN + 108, y: top - 22, size: 12, font: bold, color: INK,
      });

      // Address + key facts
      page.drawText(truncate(formatAddress(s.property.address), font, 8.5, innerW - 120), {
        x: MARGIN + 40, y: top - 35, size: 8.5, font, color: MUTED,
      });
      const facts = [
        s.property.market ? `Submarket: ${s.property.market}` : null,
        s.property.total_sf != null ? `${s.property.total_sf.toLocaleString()} SF` : null,
        s.property.year_built ? `Built ${s.property.year_built}` : null,
        s.property.parking_ratio ? `Parking ${s.property.parking_ratio}` : null,
      ].filter(Boolean).join('   ·   ');
      if (facts) {
        page.drawText(truncate(facts, font, 8, innerW - 60), {
          x: MARGIN + 40, y: top - 46, size: 8, font, color: INK,
        });
      }

      // Suite table
      let sy = top - 62;
      if (suites.length === 0) {
        page.drawText('No suites listed', { x: MARGIN + 40, y: sy, size: 8, font, color: MUTED });
      } else {
        const cols = { suite: MARGIN + 40, sf: MARGIN + 150, rate: MARGIN + 220, avail: MARGIN + 330 };
        page.drawText('SUITE', { x: cols.suite, y: sy, size: 6.5, font: bold, color: MUTED });
        page.drawText('SF', { x: cols.sf, y: sy, size: 6.5, font: bold, color: MUTED });
        page.drawText('RATE', { x: cols.rate, y: sy, size: 6.5, font: bold, color: MUTED });
        page.drawText('AVAILABLE', { x: cols.avail, y: sy, size: 6.5, font: bold, color: MUTED });
        sy -= 4;
        page.drawLine({
          start: { x: MARGIN + 40, y: sy }, end: { x: width - MARGIN - 12, y: sy },
          thickness: 0.5, color: RULE,
        });
        sy -= 11;

        suites.forEach(su => {
          const sale = isSaleSuite(su);
          const rate = sale
            ? (salePriceOf(su) != null ? `$${Math.round(salePriceOf(su)!).toLocaleString()}` : '—')
            : (su.base_rent != null ? `$${Number(su.base_rent).toFixed(2)}/SF` : '—');
          const label = su.listing_type && su.listing_type !== 'lease'
            ? `${su.suite_name ?? '—'} (${su.listing_type})`
            : (su.suite_name ?? '—');
          page.drawText(truncate(label, font, 8, 104), { x: cols.suite, y: sy, size: 8, font, color: INK });
          page.drawText(su.sf != null ? su.sf.toLocaleString() : '—', { x: cols.sf, y: sy, size: 8, font, color: INK });
          page.drawText(rate, { x: cols.rate, y: sy, size: 8, font, color: INK });
          page.drawText(truncate(su.available ?? '—', font, 8, innerW - 300), {
            x: cols.avail, y: sy, size: 8, font, color: su.available === 'Available Now' ? ECR_RED : MUTED,
          });
          sy -= 14;
        });
      }

      y = top - cardH - 10;
    });

    drawFooter(page, font);
  }

  // ── 3. Map + legend ───────────────────────────────────────────────────────
  {
    const page = pdf.addPage(LETTER);
    const { width, height } = page.getSize();
    let y = height - MARGIN;

    page.drawText('TOUR MAP', { x: MARGIN, y, size: 16, font: bold, color: INK });
    page.drawLine({ start: { x: MARGIN, y: y - 12 }, end: { x: width - MARGIN, y: y - 12 }, thickness: 2, color: ECR_RED });
    y -= 32;

    if (input.mapImageDataUrl) {
      try {
        const mapImg = await pdf.embedPng(dataUrlToBytes(input.mapImageDataUrl));
        const maxW = width - MARGIN * 2;
        const maxH = 330;
        const scale = Math.min(maxW / mapImg.width, maxH / mapImg.height);
        const w = mapImg.width * scale;
        const h = mapImg.height * scale;
        page.drawImage(mapImg, { x: MARGIN, y: y - h, width: w, height: h });
        page.drawRectangle({ x: MARGIN, y: y - h, width: w, height: h, borderColor: RULE, borderWidth: 0.75 });
        y -= h + 26;
      } catch {
        // A failed map capture shouldn't cost the package its legend.
        y -= 6;
      }
    }

    page.drawText('LEGEND', { x: MARGIN, y, size: 8, font: bold, color: MUTED });
    y -= 14;

    // Two columns so a long tour still fits on the map page.
    const colW = (width - MARGIN * 2) / 2;
    const perCol = Math.ceil(input.stops.length / 2);
    input.stops.forEach((s, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = MARGIN + col * colW;
      const rowY = y - row * 18;
      if (rowY < 60) return;
      page.drawCircle({ x: x + 6, y: rowY + 3, size: 7, color: INK });
      const numW = bold.widthOfTextAtSize(String(i + 1), 7);
      page.drawText(String(i + 1), { x: x + 6 - numW / 2, y: rowY, size: 7, font: bold, color: rgb(1, 1, 1) });
      page.drawText(truncate(s.property.name, font, 9, colW - 70), { x: x + 18, y: rowY, size: 9, font, color: INK });
      page.drawText(input.formatTime(s.time), {
        x: x + colW - 58, y: rowY, size: 8, font: bold, color: MUTED,
      });
    });

    drawFooter(page, font);
  }

  // ── 4. Flyers, in tour order ──────────────────────────────────────────────
  for (const s of input.stops) {
    const url = s.property.brochure_url;
    if (!url) {
      flyersMissing.push(s.property.name);
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const bytes = await res.arrayBuffer();
      const donor = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await pdf.copyPages(donor, donor.getPageIndices());
      pages.forEach(p => pdf.addPage(p));
      flyersIncluded.push(s.property.name);
    } catch {
      flyersFailed.push(s.property.name);
    }
  }

  const bytes = await pdf.save();
  // Copy into a fresh ArrayBuffer — pdf-lib may hand back a view over a larger
  // buffer, and Blob would otherwise include the slack bytes.
  const blob = new Blob([bytes.slice()], { type: 'application/pdf' });

  const slug = (input.clientName || 'tour').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const fileName = `${slug || 'tour'}-tour-package${input.tourDate ? `-${input.tourDate}` : ''}.pdf`;

  return { blob, fileName, flyersIncluded, flyersMissing, flyersFailed };
}
