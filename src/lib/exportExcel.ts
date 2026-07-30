// Builds the .xlsx Property Summary Report. Styling is lifted from the two
// marketing templates (Property Summary Report Template.xlsx / Property
// Summary Sale Template.xlsx): red header band, alternating slate row fills,
// Montserrat, thin borders, landscape at 60% zoom, and the same live formulas
// so the sheet still recalculates when someone edits a number.
import { SummaryReport, ReportRow, reportFileName } from './summaryReport';
import logoUrl from '../assets/ecr-logo-block.png';

const INK = 'FF334041'; // slate text / title band
const RED = 'FFDB202E'; // ECR red header row
const ROW_A = 'FFDCE4E3'; // alternating row fills
const ROW_B = 'FFBECCCB';
const WHITE = 'FFFFFFFF';

const THIN = { style: 'thin' as const, color: { argb: 'FF9AABA8' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const FMT_SF = '#,##0';
const FMT_USD = '"$"#,##0.00';
const FMT_MONEY = '"$"#,##0.00_);[Red]("$"#,##0.00)';
const FMT_WHOLE = '"$"#,##0';

const LEASE_WIDTHS = [16.9, 34.7, 18, 31.4, 25.3, 26.1, 23.4, 36.4, 18, 22, 54.4];
const SALE_WIDTHS = [16.9, 34.7, 18, 31.4, 34.3, 33.3, 20, 22, 54.4];

type Sheet = any; // exceljs types are loaded dynamically

async function loadExcelJS() {
  const mod: any = await import('exceljs');
  return mod.default ?? mod;
}

async function logoBuffer(): Promise<ArrayBuffer> {
  const res = await fetch(logoUrl);
  return res.arrayBuffer();
}

function titleBlock(ws: Sheet, report: SummaryReport, lastCol: number, logoId: number) {
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = 'Property Summary Report\nA  U  S  T  I  N  ,  T  E  X  A  S  ';
  title.font = { name: 'Montserrat Medium', size: 20, color: { argb: WHITE } };
  title.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
  ws.getRow(1).height = 110;

  // Logo sits over the left of the title band, as in the template.
  ws.addImage(logoId, { tl: { col: 0.15, row: 0.25 }, ext: { width: 300, height: 102 } });

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `${report.clientName.toUpperCase()}   |   ${report.dateLabel.toUpperCase()}`;
  sub.font = { name: 'Montserrat', size: 22, bold: true, color: { argb: INK } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 58;
}

function headerRow(ws: Sheet, headers: string[]) {
  const row = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Montserrat', size: 11, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
  });
  row.height = 54;
}

// Shared per-cell dressing: alternating fill, Montserrat, thin borders.
function dressRow(ws: Sheet, rowIdx: number, cols: number, even: boolean) {
  const row = ws.getRow(rowIdx);
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? ROW_A : ROW_B } };
    cell.font = { name: 'Montserrat Medium', size: 11, color: { argb: INK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
  }
  row.height = 42;
}

function buildingCell(r: ReportRow): string {
  return r.address ? `${r.building}\n${r.address}` : r.building;
}

function flyerCell(ws: Sheet, rowIdx: number, col: number, r: ReportRow) {
  const cell = ws.getRow(rowIdx).getCell(col);
  if (r.brochureUrl) {
    cell.value = { text: 'View Flyer', hyperlink: r.brochureUrl };
    cell.font = { name: 'Montserrat Medium', size: 11, color: { argb: RED }, underline: true };
  } else {
    cell.value = '';
  }
}

function leaseSheet(wb: any, report: SummaryReport, logoId: number) {
  const ws = wb.addWorksheet('Property Summary', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ zoomScale: 60, state: 'frozen', ySplit: 3 }],
  });
  LEASE_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  titleBlock(ws, report, LEASE_WIDTHS.length, logoId);
  headerRow(ws, [
    'PROPERTY #', 'BUILDING/ADDRESS', 'SUITE NUMBER', 'SQUARE FEET', 'BASE RENT',
    `${report.year}\nOPERATING EXPENSES`, 'FULL \nSERVICE \nRATE', 'QUOTED \nMONTHLY RENT',
    'PARKING', 'FLYERS/FLOORPLANS', 'NOTES',
  ]);

  report.lease.forEach((r, i) => {
    const n = 4 + i;
    const row = ws.getRow(n);
    row.getCell(1).value = r.propertyNo;
    row.getCell(2).value = buildingCell(r);
    row.getCell(3).value = r.suite;
    row.getCell(4).value = r.sf;
    row.getCell(5).value = r.baseRent;
    row.getCell(6).value = r.opEx;
    // Live formulas, exactly as the template writes them — but only where
    // there's a rent to build on. Without a base rent, =(F+E) would present
    // the operating expense on its own as a full service rate.
    if (r.baseRent != null) {
      row.getCell(7).value = { formula: `(F${n}+E${n})` };
      if (r.sf != null) row.getCell(8).value = { formula: `(G${n}*D${n})/12` };
    }
    row.getCell(9).value = r.parking;
    flyerCell(ws, n, 10, r);
    row.getCell(11).value = r.notes;

    dressRow(ws, n, LEASE_WIDTHS.length, i % 2 === 0);
    row.getCell(2).font = { name: 'Montserrat', size: 11, bold: true, color: { argb: INK } };
    row.getCell(4).numFmt = FMT_SF;
    row.getCell(5).numFmt = FMT_USD;
    row.getCell(6).numFmt = FMT_USD;
    row.getCell(7).numFmt = FMT_USD;
    row.getCell(8).numFmt = FMT_MONEY;
    row.getCell(11).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (r.brochureUrl) {
      row.getCell(10).font = { name: 'Montserrat Medium', size: 11, color: { argb: RED }, underline: true };
    }
  });
  return ws;
}

function saleSheet(wb: any, report: SummaryReport, logoId: number) {
  const ws = wb.addWorksheet('For Sale', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ zoomScale: 60, state: 'frozen', ySplit: 3 }],
  });
  SALE_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  titleBlock(ws, report, SALE_WIDTHS.length, logoId);
  headerRow(ws, [
    'PROPERTY #', 'BUILDING/\nADDRESS', 'SUITE NUMBER', 'SQUARE FEET', 'SALES PRICE',
    'PRICE PER SF', 'PARKING', 'FLYER/FLOORPLAN', 'NOTES',
  ]);

  report.sale.forEach((r, i) => {
    const n = 4 + i;
    const row = ws.getRow(n);
    row.getCell(1).value = r.propertyNo;
    row.getCell(2).value = buildingCell(r);
    row.getCell(3).value = r.suite;
    row.getCell(4).value = r.sf;
    row.getCell(5).value = r.salePrice;
    // Guard the divisor: a suite with no SF would yield #DIV/0!.
    if (r.salePrice != null && r.sf) row.getCell(6).value = { formula: `(E${n}/D${n})` };
    row.getCell(7).value = r.parking;
    flyerCell(ws, n, 8, r);
    row.getCell(9).value = r.notes;

    dressRow(ws, n, SALE_WIDTHS.length, i % 2 === 0);
    row.getCell(2).font = { name: 'Montserrat', size: 11, bold: true, color: { argb: INK } };
    row.getCell(4).numFmt = FMT_SF;
    row.getCell(5).numFmt = FMT_WHOLE;
    row.getCell(6).numFmt = FMT_USD;
    row.getCell(9).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (r.brochureUrl) {
      row.getCell(8).font = { name: 'Montserrat Medium', size: 11, color: { argb: RED }, underline: true };
    }
  });
  return ws;
}

// Returns the workbook bytes; the caller decides how to deliver them.
export async function buildSummaryWorkbook(report: SummaryReport): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Equitable Commercial Realty';
  wb.created = new Date();

  const logoId = wb.addImage({ buffer: await logoBuffer(), extension: 'png' });

  // Only emit the sheets that have rows — a lease-only client shouldn't get
  // an empty For Sale tab, and vice versa.
  if (report.lease.length > 0 || report.sale.length === 0) leaseSheet(wb, report, logoId);
  if (report.sale.length > 0) saleSheet(wb, report, logoId);

  // Blank Map tab, matching the templates — a place to paste the map graphic.
  wb.addWorksheet('Map', { pageSetup: { orientation: 'landscape' } });

  return wb.xlsx.writeBuffer();
}

export async function downloadSummaryWorkbook(report: SummaryReport): Promise<void> {
  const buffer = await buildSummaryWorkbook(report);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportFileName(report)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
