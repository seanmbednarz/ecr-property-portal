// Reads an uploaded ECR Deal Analysis workbook into Deal objects.
//
// The template has a FIXED layout, which is what makes upload reliable: every
// line item lives on a known row, each term option is a fixed-height section,
// and each negotiation stage is an 8-column block. We read only the broker's
// typed INPUTS and let calc.ts derive every total, so the dashboard can never
// drift from the spreadsheet.
//
// A freshly generated template has no cached formula results (Excel only
// stores those once it has opened and saved the file), so anywhere the
// template uses a formula we recompute the value rather than trusting a cache.
//
// Layout must stay in sync with the template generator.

import {
  Deal, ParseResult, Party, RentPeriod, Stage, TermOption,
} from './types';
import {
  Layout, NOPTIONS, detectLayout, describeMismatch, readStamp, sectionStart,
} from './layout';

const NSTAGES = 10;
const BLOCK_WIDTH = 8;
const NSUITES = 4;

// --- header rows (1-based); identical in every template version ---
const R_NAME = 2, R_ADDR = 3, R_BLDG = 4, R_TYPE = 5;
const R_SUITE0 = 8, R_TOTAL = 12;

/** Tabs that never contain a deal. */
const SKIP_TABS = [/^summary$/i, /^instructions$/i, /do not upload/i, /^example/i];

/** First column of a stage block: stage 1 -> B(2), stage 2 -> J(10), ... */
const blockCol = (stageIdx: number) => 2 + stageIdx * BLOCK_WIDTH;

/** exceljs cells can hold rich text, formula results, or plain values. */
function cellText(ws: any, row: number, col: number): string {
  const v = ws.getCell(row, col).value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return (v as any).result == null ? '' : String((v as any).result).trim();
    if ('richText' in v) return ((v as any).richText ?? []).map((r: any) => r.text).join('').trim();
    if ('text' in v) return String((v as any).text).trim();
    return '';
  }
  return String(v).trim();
}

/** Numeric value, or null when the cell is empty or an uncached formula. */
function cellNumOrNull(ws: any, row: number, col: number): number | null {
  const v = ws.getCell(row, col).value;
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const r = (v as any).result;
    return typeof r === 'number' ? r : null;
  }
  const n = parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return isNaN(n) ? null : n;
}

const cellNum = (ws: any, row: number, col: number) => cellNumOrNull(ws, row, col) ?? 0;

function isYes(s: string) {
  return /^y(es)?$/i.test(s.trim());
}

/**
 * Party comes from an explicit dropdown, which is what the Summary tab keys
 * off too. Fall back to the label, then to alternating landlord/tenant.
 */
function partyOf(partyCell: string, label: string, index: number): Party {
  const p = partyCell.trim().toLowerCase();
  if (p.startsWith('landlord')) return 'landlord';
  if (p.startsWith('tenant')) return 'tenant';
  if (/tenant/i.test(label)) return 'tenant';
  if (/landlord|sublandlord/i.test(label)) return 'landlord';
  return index % 2 === 0 ? 'landlord' : 'tenant';
}

function readPeriods(ws: any, lay: Layout, S: number, c0: number): RentPeriod[] {
  const out: RentPeriod[] = [];
  for (let i = 0; i < lay.nper; i++) {
    const row = S + lay.O_PER0 + i;
    const months = cellNum(ws, row, c0 + 1);
    if (months <= 0) continue;
    out.push({
      mos: cellText(ws, row, c0) || `${out.length + 1}`,
      months: Math.round(months),
      sf: cellNumOrNull(ws, row, c0 + 2),
      baseRate: cellNum(ws, row, c0 + 3),
      opex: cellNum(ws, row, c0 + 4),
      directExp: cellNum(ws, row, c0 + 5),
    });
  }
  return out;
}

function readStage(ws: any, lay: Layout, S: number, stageIdx: number, totalRSF: number): Stage | null {
  const c0 = blockCol(stageIdx);
  const periods = readPeriods(ws, lay, S, c0);
  const parkRatio = cellNum(ws, S + lay.O_PRATIO, c0 + 3);
  const tiAllowancePSF = cellNum(ws, S + lay.O_TIALLOW, c0 + 3);
  const tiConstructionPSF = cellNum(ws, S + lay.O_TICONSTR, c0 + 3);
  const label = cellText(ws, S + lay.O_PARTY, c0 + 1);

  // A stage counts as "used" only when it has a rent schedule. Stray parking
  // or TI values without months are treated as an unfinished block.
  if (periods.length === 0) return null;

  const reservedSpaces = cellNum(ws, S + lay.O_PRES, c0 + 3);
  // Unreserved is a formula in the template unless the broker typed over it.
  const totalSpaces = parkRatio * totalRSF / 1000;
  const unreservedRaw = cellNumOrNull(ws, S + lay.O_PUNRES, c0 + 3);
  const unreservedSpaces = unreservedRaw ?? Math.max(0, totalSpaces - reservedSpaces);

  const phaseSF = cellNumOrNull(ws, S + lay.O_PHASE, c0 + 1);

  return {
    index: stageIdx,
    label: label || `Stage ${stageIdx + 1}`,
    party: partyOf(cellText(ws, S + lay.O_PARTY, c0), label, stageIdx),
    commence: cellText(ws, S + lay.O_COMMENCE, c0),
    phaseIn: isYes(cellText(ws, S + lay.O_PHASE, c0)),
    phaseSF: phaseSF && phaseSF > 0 ? phaseSF : null,
    periods,
    parkRatio,
    reservedSpaces,
    reservedRate: cellNum(ws, S + lay.O_PRES, c0 + 6),
    unreservedSpaces,
    unreservedRate: cellNum(ws, S + lay.O_PUNRES, c0 + 6),
    parkAbatedMonths: cellNum(ws, S + lay.O_PABATE, c0 + 3),
    tiAllowancePSF,
    tiConstructionPSF,
    movingAllowance: cellNum(ws, S + lay.O_MOVING, c0 + 7),
    concessionDesc: cellText(ws, S + lay.O_CONC, c0),
    concession: cellNum(ws, S + lay.O_CONC, c0 + 7),
    otherCost: cellNum(ws, S + lay.O_OTHER, c0 + 7),
    otherDesc: cellText(ws, S + lay.O_OTHER, c0),
    termination: cellText(ws, S + lay.O_TERMINATION, c0),
    renewal: cellText(ws, S + lay.O_RENEWAL, c0),
    securitization: cellNum(ws, S + lay.O_SECUR, c0 + 3),
    securitizationTerms: cellText(ws, S + lay.O_SECUR, c0 + 4),
    notes: cellText(ws, S + lay.O_NOTES, c0),
  };
}

export async function parseWorkbook(file: File): Promise<ParseResult> {
  const ExcelJS: any = await import('exceljs');
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  const wb = new Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const deals: Deal[] = [];
  const warnings: string[] = [];
  const rejected: string[] = [];

  wb.eachSheet((ws: any) => {
    const tab = String(ws.name ?? '').trim();
    if (SKIP_TABS.some(re => re.test(tab))) return;

    // Total RSF is a SUM formula in the sheet, so add the suites ourselves.
    const suites: { name: string; rsf: number }[] = [];
    for (let i = 0; i < NSUITES; i++) {
      const name = cellText(ws, R_SUITE0 + i, 2);
      const rsf = cellNum(ws, R_SUITE0 + i, 3);
      if (name || rsf > 0) suites.push({ name, rsf });
    }
    const totalRSF = suites.reduce((a, s) => a + s.rsf, 0) || cellNum(ws, R_TOTAL, 3);
    const name = cellText(ws, R_NAME, 2);

    // Which template version is this tab written in? An untouched sheet
    // matches exactly one layout; one with rows inserted matches none, and is
    // refused rather than read off-by-a-row. A tab nobody has started is
    // skipped quietly — an unused placeholder is not an error.
    const detected = detectLayout(ws);
    if (!detected.layout) {
      const started = !!name || suites.length > 0;
      if (started) rejected.push(describeMismatch(tab, detected, readStamp(ws)));
      return;
    }
    const lay = detected.layout;

    const options: TermOption[] = [];
    for (let oi = 0; oi < NOPTIONS; oi++) {
      const S = sectionStart(lay, oi);
      const stages: Stage[] = [];
      for (let si = 0; si < NSTAGES; si++) {
        const st = readStage(ws, lay, S, si, totalRSF);
        if (st) stages.push(st);
      }
      if (stages.length === 0) continue;   // unused term option
      options.push({
        index: oi,
        label: cellText(ws, S + lay.O_BANNER, 2) || `Option ${oi + 1}`,
        stages,
      });
    }

    if (options.length === 0) {
      // Only worth flagging if the broker started filling the tab in.
      if (name) warnings.push(`"${tab}" has no rent schedule filled in — skipped.`);
      return;
    }
    if (totalRSF <= 0) {
      warnings.push(`"${tab}" has no suite sizes, so per-SF figures will be blank.`);
    }

    const taxRaw = cellNumOrNull(ws, R_TOTAL, 5);
    deals.push({
      id: tab,
      tabName: tab,
      name: name || tab,
      address: cellText(ws, R_ADDR, 2),
      building: cellText(ws, R_BLDG, 2),
      type: cellText(ws, R_TYPE, 2) || 'New Lease',
      structure: cellText(ws, R_TYPE, 5) || 'FSG',
      suites,
      totalRSF,
      parkingTaxRate: taxRaw == null ? 0.0825 : taxRaw,
      options,
    });
  });

  // One bad tab fails the whole upload. Importing the readable tabs and
  // dropping the rest would produce an analysis that looks complete while
  // silently missing a deal, which is how a wrong number reaches a client.
  if (rejected.length > 0) {
    throw new Error(rejected.join(' '));
  }
  if (deals.length === 0) {
    throw new Error('no deal tabs found — is this the ECR Deal Analysis template?');
  }
  return { deals, warnings };
}
