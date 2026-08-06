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

const NSTAGES = 10;
const BLOCK_WIDTH = 8;
const NPERIODS = 12;
const NSUITES = 4;
const NOPTIONS = 2;

// --- header rows (1-based) ---
const R_NAME = 2, R_ADDR = 3, R_BLDG = 4, R_TYPE = 5;
const R_SUITE0 = 8, R_TOTAL = 12;

// --- term-option sections ---
const SEC0 = 15, SECTION_H = 42;
const sectionStart = (i: number) => SEC0 + i * SECTION_H;

// --- row offsets within a section ---
const O_BANNER = 0, O_PARTY = 1, O_COMMENCE = 2, O_PHASE = 3, O_PER0 = 5;
const O_PRATIO = 20, O_PRES = 22, O_PUNRES = 23, O_PABATE = 24;
const O_TIALLOW = 27, O_TICONSTR = 28;
const O_MOVING = 30, O_CONC = 31, O_OTHER = 32;
const O_TERMINATION = 33, O_RENEWAL = 34, O_SECUR = 35, O_NOTES = 38;

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

function readPeriods(ws: any, S: number, c0: number): RentPeriod[] {
  const out: RentPeriod[] = [];
  for (let i = 0; i < NPERIODS; i++) {
    const row = S + O_PER0 + i;
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

function readStage(ws: any, S: number, stageIdx: number, totalRSF: number): Stage | null {
  const c0 = blockCol(stageIdx);
  const periods = readPeriods(ws, S, c0);
  const parkRatio = cellNum(ws, S + O_PRATIO, c0 + 3);
  const tiAllowancePSF = cellNum(ws, S + O_TIALLOW, c0 + 3);
  const tiConstructionPSF = cellNum(ws, S + O_TICONSTR, c0 + 3);
  const label = cellText(ws, S + O_PARTY, c0 + 1);

  // A stage counts as "used" only when it has a rent schedule. Stray parking
  // or TI values without months are treated as an unfinished block.
  if (periods.length === 0) return null;

  const reservedSpaces = cellNum(ws, S + O_PRES, c0 + 3);
  // Unreserved is a formula in the template unless the broker typed over it.
  const totalSpaces = parkRatio * totalRSF / 1000;
  const unreservedRaw = cellNumOrNull(ws, S + O_PUNRES, c0 + 3);
  const unreservedSpaces = unreservedRaw ?? Math.max(0, totalSpaces - reservedSpaces);

  const phaseSF = cellNumOrNull(ws, S + O_PHASE, c0 + 1);

  return {
    index: stageIdx,
    label: label || `Stage ${stageIdx + 1}`,
    party: partyOf(cellText(ws, S + O_PARTY, c0), label, stageIdx),
    commence: cellText(ws, S + O_COMMENCE, c0),
    phaseIn: isYes(cellText(ws, S + O_PHASE, c0)),
    phaseSF: phaseSF && phaseSF > 0 ? phaseSF : null,
    periods,
    parkRatio,
    reservedSpaces,
    reservedRate: cellNum(ws, S + O_PRES, c0 + 6),
    unreservedSpaces,
    unreservedRate: cellNum(ws, S + O_PUNRES, c0 + 6),
    parkAbatedMonths: cellNum(ws, S + O_PABATE, c0 + 3),
    tiAllowancePSF,
    tiConstructionPSF,
    movingAllowance: cellNum(ws, S + O_MOVING, c0 + 7),
    concessionDesc: cellText(ws, S + O_CONC, c0),
    concession: cellNum(ws, S + O_CONC, c0 + 7),
    otherCost: cellNum(ws, S + O_OTHER, c0 + 7),
    otherDesc: cellText(ws, S + O_OTHER, c0),
    termination: cellText(ws, S + O_TERMINATION, c0),
    renewal: cellText(ws, S + O_RENEWAL, c0),
    securitization: cellNum(ws, S + O_SECUR, c0 + 3),
    securitizationTerms: cellText(ws, S + O_SECUR, c0 + 4),
    notes: cellText(ws, S + O_NOTES, c0),
  };
}

export async function parseWorkbook(file: File): Promise<ParseResult> {
  const ExcelJS: any = await import('exceljs');
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  const wb = new Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const deals: Deal[] = [];
  const warnings: string[] = [];

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

    const options: TermOption[] = [];
    for (let oi = 0; oi < NOPTIONS; oi++) {
      const S = sectionStart(oi);
      const stages: Stage[] = [];
      for (let si = 0; si < NSTAGES; si++) {
        const st = readStage(ws, S, si, totalRSF);
        if (st) stages.push(st);
      }
      if (stages.length === 0) continue;   // unused term option
      options.push({
        index: oi,
        label: cellText(ws, S + O_BANNER, 2) || `Option ${oi + 1}`,
        stages,
      });
    }

    const name = cellText(ws, R_NAME, 2);
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

  if (deals.length === 0) {
    throw new Error('no deal tabs found — is this the ECR Deal Analysis template?');
  }
  return { deals, warnings };
}
