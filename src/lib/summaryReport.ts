// Shared data model for the per-client Property Summary Report, built once
// and rendered two ways: an .xlsx workbook (exportExcel.ts) and a print view
// (PrintSummary.tsx). Mirrors the two Excel templates marketing already
// uses — a lease sheet and a sale sheet — so an exported file drops straight
// into the existing workflow.
import { Property, Suite } from '../types';
import { isSaleSuite, salePriceOf, listingStatusOf } from './propertyMeta';

export interface ReportRow {
  propertyNo: number;
  building: string;
  address: string;
  suite: string;
  sf: number | null;
  baseRent: number | null; // lease: $/SF rent · sale: unused
  opEx: number | null; // lease only
  salePrice: number | null; // sale only
  parking: string | null;
  brochureUrl: string | null;
  imageUrl: string | null; // used by the PDF/print view only
  notes: string | null;
}

export interface SummaryReport {
  clientName: string;
  dateLabel: string;
  year: number;
  lease: ReportRow[];
  sale: ReportRow[];
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// A property with no suites still belongs in the report — it lands on the
// sheet its listing status implies, carrying building-level SF.
function sheetForPropertyWithoutSuites(p: Property): 'lease' | 'sale' {
  const statuses = listingStatusOf(p);
  const forSale = statuses.includes('For Sale') || statuses.includes('Sold');
  const forLease = statuses.includes('For Lease') || statuses.includes('For Sublease');
  return forSale && !forLease ? 'sale' : 'lease';
}

export function buildSummaryReport(
  properties: Property[],
  clientName: string,
  today: Date = new Date(),
): SummaryReport {
  const lease: ReportRow[] = [];
  const sale: ReportRow[] = [];

  properties.forEach((p, i) => {
    const propertyNo = i + 1;
    const base = {
      propertyNo,
      building: p.name,
      address: p.address,
      parking: p.parking_ratio,
      brochureUrl: p.brochure_url,
      imageUrl: p.hero_image_url,
    };
    const suites = p.suites ?? [];

    if (suites.length === 0) {
      const row: ReportRow = {
        ...base,
        suite: '',
        sf: p.total_sf,
        baseRent: null,
        opEx: p.op_exp,
        salePrice: null,
        notes: null,
      };
      (sheetForPropertyWithoutSuites(p) === 'sale' ? sale : lease).push(row);
      return;
    }

    suites.forEach((s: Suite) => {
      const row: ReportRow = {
        ...base,
        suite: s.suite_name ?? '',
        sf: s.sf,
        baseRent: s.base_rent,
        // Suite op. exp. wins; otherwise fall back to the building's.
        opEx: s.op_exp ?? p.op_exp,
        salePrice: salePriceOf(s),
        notes: s.notes,
      };
      (isSaleSuite(s) ? sale : lease).push(row);
    });
  });

  return {
    clientName: clientName || 'All Properties',
    dateLabel: longDate(today),
    year: today.getFullYear(),
    lease,
    sale,
  };
}

// Filesystem-safe base name, e.g. "Property Summary — Rokt — 2026-07-30".
export function reportFileName(report: SummaryReport, today: Date = new Date()): string {
  const iso = today.toISOString().slice(0, 10);
  const client = report.clientName.replace(/[^A-Za-z0-9 &-]/g, '').trim() || 'All Properties';
  return `Property Summary - ${client} - ${iso}`;
}
