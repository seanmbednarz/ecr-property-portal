// Template layouts, and the check that an uploaded sheet really is one of them.
//
// WHY THIS EXISTS
// The parser reads fixed cell positions — row 35 is the parking ratio, row 42
// is the TI allowance, and so on. That is what makes upload reliable, but it
// assumes the sheet's shape is untouched. It isn't always: a broker who needs
// more rent periods than the template provides will insert rows, which slides
// everything below down. The parser then reads the neighbouring line and is
// confidently wrong — a blank cell becomes "$0 parking", a $70/SF allowance
// becomes $700,000 of construction cost, and nothing warns anyone.
//
// So before reading a tab we verify that the labels we expect are actually
// sitting on the rows we are about to read. Note the direction: we read the
// label AT a known row and compare it. We never search for a row by its label.
// If a label is reworded the upload fails loudly, rather than matching some
// other row and quietly producing a wrong number.
//
// TWO LAYOUTS
// v3 gives 12 rent-period rows; v4 gives 24, because 12 was the thing driving
// brokers to insert rows in the first place. v3 copies are already circulating
// and cannot be recalled, so both are supported. Every row offset derives from
// the period count exactly as the template generator derives it, so one number
// describes a layout.

export interface Layout {
  version: string;
  nper: number;
  O_BANNER: number; O_PARTY: number; O_COMMENCE: number; O_PHASE: number; O_PER0: number;
  O_TOT: number; O_PRATIO: number; O_PRES: number; O_PUNRES: number; O_PABATE: number;
  O_TIALLOW: number; O_TICONSTR: number; O_MOVING: number; O_CONC: number; O_OTHER: number;
  O_TERMINATION: number; O_RENEWAL: number; O_SECUR: number; O_TOC: number; O_NOTES: number;
  SECTION_H: number;
}

/** First row of the first term-option section. Unchanged between versions. */
export const SEC0 = 15;
export const NOPTIONS = 2;

/**
 * Offsets within a section, derived from the period count the same way the
 * template generator derives them (O_TOT = O_PER0 + NPER; everything else is
 * a fixed step from O_TOT). Keep in step with gen_template.
 */
export function layoutFor(version: string, nper: number): Layout {
  const O_PER0 = 5;
  const O_TOT = O_PER0 + nper;
  return {
    version, nper,
    O_BANNER: 0, O_PARTY: 1, O_COMMENCE: 2, O_PHASE: 3, O_PER0,
    O_TOT,
    O_PRATIO: O_TOT + 3,
    O_PRES: O_TOT + 5,
    O_PUNRES: O_TOT + 6,
    O_PABATE: O_TOT + 7,
    O_TIALLOW: O_TOT + 10,
    O_TICONSTR: O_TOT + 11,
    O_MOVING: O_TOT + 13,
    O_CONC: O_TOT + 14,
    O_OTHER: O_TOT + 15,
    O_TERMINATION: O_TOT + 16,
    O_RENEWAL: O_TOT + 17,
    O_SECUR: O_TOT + 18,
    O_TOC: O_TOT + 19,
    O_NOTES: O_TOT + 21,
    SECTION_H: nper + 30,
  };
}

/** Newest first, so a v4 sheet is identified without consulting v3 at all. */
export const LAYOUTS: Layout[] = [layoutFor('v4', 24), layoutFor('v3', 12)];

export const sectionStart = (lay: Layout, i: number) => SEC0 + i * lay.SECTION_H;

/**
 * Landmarks checked in every section. Deliberately few and far apart: one
 * before the rent schedule, one immediately after it, then the parking and TI
 * blocks, then the section total. An inserted or deleted row anywhere in a
 * section moves at least one of them.
 */
const ANCHORS: { offset: keyof Layout; label: string; test: RegExp }[] = [
  { offset: 'O_BANNER', label: 'TERM OPTION', test: /^\s*term option/i },
  { offset: 'O_TOT', label: 'Total', test: /^total$/i },
  { offset: 'O_PRATIO', label: 'Parking ratio', test: /^parking ratio/i },
  { offset: 'O_TIALLOW', label: 'TI allowance', test: /^ti allowance/i },
  { offset: 'O_TOC', label: 'TOTAL OCCUPANCY COST', test: /^total occupancy cost/i },
];

export interface Mismatch {
  row: number;
  expected: string;
  found: string;
}

/** Row label, taken from column A and falling back to column B. */
function rowLabel(ws: any, row: number): string {
  for (const col of [1, 2]) {
    const v = ws.getCell(row, col).value;
    if (v == null) continue;
    const s = typeof v === 'object'
      ? ('richText' in v ? ((v as any).richText ?? []).map((r: any) => r.text).join('') : String((v as any).result ?? ''))
      : String(v);
    if (s.trim()) return s.trim().replace(/\s+/g, ' ');
  }
  return '';
}

/**
 * Checks a tab against one layout, returning every landmark that is not where
 * the layout says it should be.
 *
 * A second term option that runs off the end of the sheet is treated as absent
 * rather than broken — a tab trimmed after one option is still readable. A
 * section that is present must match in full.
 */
export function validateLayout(ws: any, lay: Layout): Mismatch[] {
  const out: Mismatch[] = [];
  const lastRow = ws.rowCount ?? 0;

  for (let oi = 0; oi < NOPTIONS; oi++) {
    const S = sectionStart(lay, oi);
    if (oi > 0 && S + lay.O_TOC > lastRow) break;   // trimmed, not malformed
    for (const a of ANCHORS) {
      const row = S + (lay[a.offset] as number);
      const found = rowLabel(ws, row);
      if (!a.test.test(found)) out.push({ row, expected: a.label, found });
    }
  }
  return out;
}

export interface Detection {
  layout: Layout | null;
  /** What each candidate layout objected to, for the error message. */
  candidates: { layout: Layout; mismatches: Mismatch[] }[];
  /** Set when a sheet somehow satisfies more than one layout. */
  ambiguous: boolean;
}

/**
 * The version marker v4 onward writes onto every deal tab. Absent in v3, and
 * only ever used to make an error message clearer — the anchors decide, so a
 * stamp that has been copied into an edited sheet can't mislead the parser.
 */
export function readStamp(ws: any): string | null {
  const v = ws.getCell(13, 20).value;
  const s = v == null ? '' : String(typeof v === 'object' ? ((v as any).result ?? '') : v);
  const m = /ECR-TEMPLATE\s+(v\d+)/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Picks the layout a tab is written in.
 *
 * A layout is only accepted when EVERY landmark matches. There is deliberately
 * no closest-fit fallback: a sheet that half-matches is a sheet whose rows have
 * moved, which is precisely the case that used to produce silent nonsense. And
 * if two layouts both matched in full we would have no basis for choosing, so
 * that is reported as ambiguous rather than guessed — there is no code path
 * that silently picks one.
 */
export function detectLayout(ws: any): Detection {
  const candidates = LAYOUTS.map(layout => ({ layout, mismatches: validateLayout(ws, layout) }));
  const matched = candidates.filter(c => c.mismatches.length === 0);

  if (matched.length === 1) return { layout: matched[0].layout, candidates, ambiguous: false };
  if (matched.length > 1) return { layout: null, candidates, ambiguous: true };
  return { layout: null, candidates, ambiguous: false };
}

/**
 * A sentence a broker can act on.
 *
 * When nothing matched we do NOT know which version the file started life as,
 * so the message names the landmark that is out of place and gives the row it
 * belongs on in each layout, rather than picking the closest candidate and
 * quoting its row as though it were authoritative. A broker holding a v3 file
 * should not be sent hunting row 44 because v4 happened to fit marginally
 * better.
 */
export function describeMismatch(tab: string, d: Detection, stamp?: string | null): string {
  const fix = 'Please copy the deal into a fresh template.';
  if (d.ambiguous) {
    return `"${tab}" matches more than one template layout, so it can't be read safely. ${fix}`;
  }

  const first = d.candidates.find(c => c.mismatches.length > 0)?.mismatches[0];
  if (!first) return `"${tab}" doesn't match the ECR Deal Analysis template. ${fix}`;

  // Where this landmark belongs under each layout we know about.
  const rows = d.candidates
    .map(c => {
      const m = c.mismatches.find(x => x.expected === first.expected);
      return m ? `row ${m.row} (${c.layout.version})` : null;
    })
    .filter(Boolean)
    .join(' or ');

  const stamped = stamp ? ` The tab is marked ${stamp}.` : '';
  return `"${tab}" doesn't match the ECR template layout — "${first.expected}" should be on `
    + `${rows}, and is on neither. Rows have probably been inserted or deleted.${stamped} ${fix}`;
}
