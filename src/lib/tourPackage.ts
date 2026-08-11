import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { Property, Broker } from '../types';
import { formatAddress } from './geocode';

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
  page.drawText('BEYOND REAL ESTATE.', {
    x: LETTER[0] - MARGIN - font.widthOfTextAtSize('BEYOND REAL ESTATE.', 7.5),
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

    const ecrBytes = await imageToPngBytes(input.ecrLogoUrl);
    if (ecrBytes) {
      const logo = await pdf.embedPng(ecrBytes);
      const w = 120;
      const h = (logo.height / logo.width) * w;
      page.drawImage(logo, { x: MARGIN, y: height - MARGIN - h, width: w, height: h });
    }

    if (input.clientLogoUrl) {
      const clientBytes = await imageToPngBytes(input.clientLogoUrl);
      if (clientBytes) {
        const logo = await pdf.embedPng(clientBytes);
        const maxW = 130;
        const maxH = 60;
        const scale = Math.min(maxW / logo.width, maxH / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;
        page.drawImage(logo, { x: width - MARGIN - w, y: height - MARGIN - h, width: w, height: h });
      }
    }

    let y = height / 2 + 90;
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
  {
    let page = pdf.addPage(LETTER);
    const { width, height } = page.getSize();
    let y = height - MARGIN;

    page.drawText('TOUR SCHEDULE', { x: MARGIN, y, size: 16, font: bold, color: INK });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: width - MARGIN, y: y - 6 }, thickness: 2, color: ECR_RED });
    y -= 14;
    if (input.tourDateLabel) {
      page.drawText(input.tourDateLabel, { x: MARGIN, y: y - 8, size: 10, font, color: MUTED });
      y -= 22;
    }
    y -= 12;

    const colX = { num: MARGIN, time: MARGIN + 30, name: MARGIN + 100, market: width - MARGIN - 96 };
    page.drawText('#', { x: colX.num, y, size: 8, font: bold, color: MUTED });
    page.drawText('TIME', { x: colX.time, y, size: 8, font: bold, color: MUTED });
    page.drawText('PROPERTY', { x: colX.name, y, size: 8, font: bold, color: MUTED });
    page.drawText('SUBMARKET', { x: colX.market, y, size: 8, font: bold, color: MUTED });
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.75, color: RULE });
    y -= 20;

    input.stops.forEach((s, i) => {
      // New page when we'd otherwise run into the footer.
      if (y < 80) {
        drawFooter(page, font);
        page = pdf.addPage(LETTER);
        y = height - MARGIN;
      }
      if (i % 2 === 0) {
        page.drawRectangle({ x: MARGIN - 6, y: y - 12, width: width - MARGIN * 2 + 12, height: 30, color: BAND });
      }
      page.drawText(String(i + 1), { x: colX.num, y, size: 10, font: bold, color: ECR_RED });
      page.drawText(input.formatTime(s.time), { x: colX.time, y, size: 10, font: bold, color: INK });
      page.drawText(truncate(s.property.name, bold, 10.5, colX.market - colX.name - 12), {
        x: colX.name, y, size: 10.5, font: bold, color: INK,
      });
      page.drawText(truncate(formatAddress(s.property.address), font, 8, colX.market - colX.name - 12), {
        x: colX.name, y: y - 11, size: 8, font, color: MUTED,
      });
      page.drawText(truncate(s.property.market ?? '', font, 8.5, 92), {
        x: colX.market, y, size: 8.5, font, color: MUTED,
      });
      y -= 30;
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
