// The metric catalog for the comparison table.
//
// `std: true` metrics are on by default; everything else is opt-in per client.
// Every metric can be toggled, standard ones included.

import { Deal, TermOption } from './types';
import { StageMetrics, money, psf, sf } from './calc';

export interface MetricCtx {
  deal: Deal;
  option: TermOption;
  m: StageMetrics;
  /** Movement vs. the landlord's opening proposal; null when not applicable. */
  savings: number | null;
}

export interface MetricDef {
  key: string;
  label: string;
  group: 'financial' | 'parking' | 'nonfinancial';
  std: boolean;
  /** Which direction wins, for the green "best" highlight. */
  best?: 'min' | 'max';
  text: (c: MetricCtx) => string;
  num?: (c: MetricCtx) => number | null;
  /** Renders as the emphasized bottom-line row. */
  emphasize?: boolean;
  /** Label that depends on the client's assumptions (e.g. the NPV rate). */
  labelFor?: (npvRate: number) => string;
}

/** The label to show, given the client's NPV discount rate. */
export function labelOf(def: MetricDef, npvRate: number): string {
  return def.labelFor ? def.labelFor(npvRate) : def.label;
}

export const DEFAULT_NPV_RATE = 0.08;

const dash = '—';
const orDash = (n: number, fmt: (v: number) => string) => (n ? fmt(n) : dash);

export const METRICS: MetricDef[] = [
  // ---- Financial · standard -------------------------------------------------
  { key: 'term', label: 'Lease term', group: 'financial', std: true,
    text: c => `${c.m.termMonths} mos` },
  { key: 'effRate', label: 'Avg effective gross rate / SF / yr', group: 'financial', std: true, best: 'min',
    text: c => psf(c.m.effectiveGrossRate), num: c => c.m.effectiveGrossRate },
  { key: 'ner', label: 'Net effective rent / SF / yr', group: 'financial', std: true, best: 'min',
    text: c => psf(c.m.netEffectiveRent), num: c => c.m.netEffectiveRent },
  { key: 'freeMos', label: 'Free rent (months)', group: 'financial', std: true, best: 'max',
    text: c => `${c.m.freeRentMonths}`, num: c => c.m.freeRentMonths },
  { key: 'rentMo', label: 'Avg gross rent / month', group: 'financial', std: true, best: 'min',
    text: c => money(c.m.avgMonthlyRent), num: c => c.m.avgMonthlyRent },
  { key: 'parkMo', label: 'Parking / month (incl. tax)', group: 'financial', std: true, best: 'min',
    text: c => money(c.m.parkingMonthlyWithTax), num: c => c.m.parkingMonthlyWithTax },
  { key: 'occMo', label: 'Avg total occupancy / month', group: 'financial', std: true, best: 'min',
    text: c => money(c.m.avgMonthlyOccupancyCost), num: c => c.m.avgMonthlyOccupancyCost },
  { key: 'rentTerm', label: 'Total gross rent over term', group: 'financial', std: true, best: 'min',
    text: c => money(c.m.totalGrossRent), num: c => c.m.totalGrossRent },
  { key: 'parkTerm', label: 'Total parking over term', group: 'financial', std: true, best: 'min',
    text: c => money(c.m.parkingCostOverTerm), num: c => c.m.parkingCostOverTerm },
  { key: 'tiOOP', label: 'Tenant out-of-pocket TI', group: 'financial', std: true, best: 'min',
    text: c => (c.m.isTurnKey ? 'Turn-Key' : money(c.m.tiOutOfPocket)), num: c => c.m.tiOutOfPocket },
  { key: 'occTotal', label: 'Total occupancy cost', group: 'financial', std: true, best: 'min', emphasize: true,
    text: c => money(c.m.totalOccupancyCost), num: c => c.m.totalOccupancyCost },
  { key: 'secur', label: 'Lease securitization', group: 'financial', std: true, best: 'min',
    text: c => (c.m.securitization
      ? `${money(c.m.securitization)}${c.m.stage.securitizationTerms ? ` · ${c.m.stage.securitizationTerms}` : ''}`
      : (c.m.stage.securitizationTerms || dash)),
    num: c => c.m.securitization || null },

  // ---- Financial · optional -------------------------------------------------
  { key: 'occPerSF', label: 'Total occupancy cost / SF / yr', group: 'financial', std: false, best: 'min',
    text: c => psf(c.m.occupancyCostPerSFYr), num: c => c.m.occupancyCostPerSFYr },
  { key: 'savings', label: 'Savings vs. landlord’s opening', group: 'financial', std: false, best: 'max',
    text: c => (c.savings == null ? dash : money(c.savings)), num: c => c.savings },
  { key: 'year1', label: 'Year 1 cost (rent + parking)', group: 'financial', std: false, best: 'min',
    text: c => money(c.m.year1Cost), num: c => c.m.year1Cost },
  { key: 'escalation', label: 'Avg annual escalation', group: 'financial', std: false, best: 'min',
    text: c => (c.m.avgEscalationPct ? `${c.m.avgEscalationPct.toFixed(2)}%` : dash),
    num: c => c.m.avgEscalationPct || null },
  { key: 'startRate', label: 'Starting rate / SF', group: 'financial', std: false, best: 'min',
    text: c => psf(c.m.startingRate), num: c => c.m.startingRate },
  { key: 'termYears', label: 'Term (years)', group: 'financial', std: false,
    text: c => `${c.m.termYears.toFixed(1)} yrs` },
  { key: 'freeValue', label: 'Free rent value', group: 'financial', std: false, best: 'max',
    text: c => money(c.m.freeRentValue), num: c => c.m.freeRentValue },
  { key: 'tiAllowPSF', label: 'TI allowance / SF', group: 'financial', std: false, best: 'max',
    text: c => (c.m.isTurnKey ? 'Turn-Key' : psf(c.m.tiAllowancePSF)), num: c => c.m.tiAllowancePSF },
  { key: 'tiAllowTotal', label: 'TI allowance (total)', group: 'financial', std: false, best: 'max',
    text: c => (c.m.isTurnKey ? 'Turn-Key' : money(c.m.tiAllowanceTotal)), num: c => c.m.tiAllowanceTotal },
  { key: 'tiOOPPSF', label: 'Tenant out-of-pocket TI / SF', group: 'financial', std: false, best: 'min',
    text: c => (c.m.isTurnKey ? 'Turn-Key' : psf(c.m.tiOutOfPocketPSF)), num: c => c.m.tiOutOfPocketPSF },
  { key: 'moving', label: 'Moving allowance', group: 'financial', std: false, best: 'max',
    text: c => orDash(c.m.movingAllowance, money), num: c => c.m.movingAllowance || null },
  { key: 'concession', label: 'Other concession', group: 'financial', std: false, best: 'max',
    text: c => (c.m.concession
      ? `${money(c.m.concession)}${c.m.stage.concessionDesc ? ` · ${c.m.stage.concessionDesc}` : ''}`
      : dash),
    num: c => c.m.concession || null },
  { key: 'otherCost', label: 'Other one-time cost', group: 'financial', std: false, best: 'min',
    text: c => (c.m.otherCost
      ? `${money(c.m.otherCost)}${c.m.stage.otherDesc ? ` · ${c.m.stage.otherDesc}` : ''}`
      : dash),
    num: c => c.m.otherCost || null },
  { key: 'directExp', label: 'Direct expenses over term', group: 'financial', std: false, best: 'min',
    text: c => orDash(c.m.directExpTotal, money), num: c => c.m.directExpTotal || null },
  { key: 'avgMoInclTI', label: 'Avg cost / mo (incl. TI)', group: 'financial', std: false, best: 'min',
    text: c => money(c.m.avgMonthlyInclTI), num: c => c.m.avgMonthlyInclTI },
  { key: 'effInclParking', label: 'Effective rate incl. parking / SF / yr', group: 'financial', std: false, best: 'min',
    text: c => psf(c.m.effectiveRateInclParking), num: c => c.m.effectiveRateInclParking },
  { key: 'concessions', label: 'Total concessions', group: 'financial', std: false, best: 'max',
    text: c => money(c.m.totalConcessions), num: c => c.m.totalConcessions },
  { key: 'securMonths', label: 'Securitization (months of rent)', group: 'financial', std: false, best: 'min',
    text: c => (c.m.securitizationMonths ? `${c.m.securitizationMonths.toFixed(1)} mos` : dash),
    num: c => c.m.securitizationMonths || null },
  { key: 'cpe150', label: 'Cost / employee (150 SF)', group: 'financial', std: false, best: 'min',
    text: c => money(c.m.costPerEmployee150), num: c => c.m.costPerEmployee150 },
  { key: 'cpe200', label: 'Cost / employee (200 SF)', group: 'financial', std: false, best: 'min',
    text: c => money(c.m.costPerEmployee200), num: c => c.m.costPerEmployee200 },
  { key: 'npv', label: 'NPV of obligations', group: 'financial', std: false, best: 'min',
    labelFor: r => `NPV of obligations (${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%)`,
    text: c => money(c.m.npv), num: c => c.m.npv },

  // ---- Parking --------------------------------------------------------------
  { key: 'pRatio', label: 'Parking ratio (per 1,000 RSF)', group: 'parking', std: true,
    text: c => (c.m.stage.parkRatio ? c.m.stage.parkRatio.toFixed(2) : dash) },
  { key: 'pSpaces', label: 'Total parking spaces', group: 'parking', std: true,
    text: c => (c.m.parkingSpaces ? c.m.parkingSpaces.toFixed(1) : dash) },
  { key: 'pReserved', label: 'Reserved spaces / rate', group: 'parking', std: true,
    text: c => (c.m.reservedSpaces
      ? `${c.m.reservedSpaces.toFixed(0)} @ ${money(c.m.stage.reservedRate)}`
      : dash) },
  { key: 'pUnreserved', label: 'Unreserved spaces / rate', group: 'parking', std: true,
    text: c => (c.m.unreservedSpaces
      ? `${c.m.unreservedSpaces.toFixed(0)} @ ${c.m.stage.unreservedRate ? money(c.m.stage.unreservedRate) : 'Free'}`
      : dash) },
  { key: 'pAbate', label: 'Abated parking (months)', group: 'parking', std: true, best: 'max',
    text: c => (c.m.parkingAbatedMonths ? `${c.m.parkingAbatedMonths}` : dash),
    num: c => c.m.parkingAbatedMonths || null },
  { key: 'pAbateValue', label: 'Abated parking value', group: 'parking', std: false, best: 'max',
    text: c => orDash(c.m.parkingAbatedValue, money), num: c => c.m.parkingAbatedValue || null },
  { key: 'pPreTax', label: 'Parking / month (pre-tax)', group: 'parking', std: false, best: 'min',
    text: c => money(c.m.parkingMonthlyPreTax), num: c => c.m.parkingMonthlyPreTax },
  { key: 'pTax', label: 'Parking tax rate', group: 'parking', std: false,
    text: c => `${((c.deal.parkingTaxRate || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}%` },

  // ---- Non-financial --------------------------------------------------------
  { key: 'size', label: 'Size (RSF)', group: 'nonfinancial', std: true, text: c => sf(c.deal.totalRSF) },
  { key: 'suites', label: 'Suite(s)', group: 'nonfinancial', std: true,
    text: c => c.deal.suites.map(s => s.name).filter(Boolean).join(', ') || dash },
  { key: 'type', label: 'Deal type', group: 'nonfinancial', std: true, text: c => c.deal.type },
  { key: 'structure', label: 'Rent structure', group: 'nonfinancial', std: true, text: c => c.deal.structure },
  { key: 'termOption', label: 'Term option', group: 'nonfinancial', std: true,
    text: c => c.option.label || `Option ${c.option.index + 1}` },
  { key: 'phase', label: 'Phase-in occupancy', group: 'nonfinancial', std: true,
    text: c => (c.m.stage.phaseIn
      ? `Yes${c.m.stage.phaseSF ? ` · ${sf(c.m.stage.phaseSF)} SF initial` : ''}`
      : 'No') },
  { key: 'commence', label: 'Commencement', group: 'nonfinancial', std: true,
    text: c => c.m.stage.commence || dash },
  { key: 'termination', label: 'Termination option(s)', group: 'nonfinancial', std: true,
    text: c => c.m.stage.termination || dash },
  { key: 'renewal', label: 'Renewal option(s)', group: 'nonfinancial', std: true,
    text: c => c.m.stage.renewal || dash },
  { key: 'building', label: 'Building', group: 'nonfinancial', std: false,
    text: c => c.deal.building || dash },
  { key: 'address', label: 'Address', group: 'nonfinancial', std: false, text: c => c.deal.address || dash },
  { key: 'stageLabel', label: 'Proposal shown', group: 'nonfinancial', std: false, text: c => c.m.stage.label },
  { key: 'notes', label: 'Proposal notes', group: 'nonfinancial', std: false, text: c => c.m.stage.notes || dash },
];

export const GROUP_LABELS: Record<MetricDef['group'], string> = {
  financial: 'Financial',
  parking: 'Parking',
  nonfinancial: 'Non-financial',
};

export interface ChartDef { key: string; label: string; std: boolean; hint: string; }

export const CHARTS: ChartDef[] = [
  { key: 'totalRent', label: 'Total rent commitment', std: true, hint: 'Gross rent over the term, per deal.' },
  { key: 'tiAllowance', label: 'TI allowance comparison', std: true, hint: 'Landlord allowance, with turn-key called out.' },
  { key: 'monthlyRent', label: 'Monthly rent commitment', std: false, hint: 'Average gross rent per month, per deal.' },
  { key: 'negotiation', label: 'Negotiation progress', std: false, hint: 'Total occupancy cost at each stage — what the back-and-forth moved.' },
  { key: 'cumulative', label: 'Cumulative cost over time', std: false, hint: 'Where a cheaper-now deal becomes the pricier one.' },
  { key: 'concessions', label: 'Concessions breakdown', std: false, hint: 'Free rent, TI allowance, abated parking and allowances.' },
];

export interface SectionDef { key: string; label: string; }

export const SECTIONS: SectionDef[] = [
  { key: 'financial', label: 'Financial metrics' },
  { key: 'parking', label: 'Parking metrics' },
  { key: 'nonfinancial', label: 'Non-financial metrics' },
  { key: 'charts', label: 'Charts' },
  // Stored under the original key so saved analyses keep working.
  { key: 'keyDifferences', label: 'Notes' },
];

export interface DisplaySettings {
  metrics: Record<string, boolean>;
  charts: Record<string, boolean>;
  sections: Record<string, boolean>;
}

export function defaultDisplay(): DisplaySettings {
  const metrics: Record<string, boolean> = {};
  METRICS.forEach(m => { metrics[m.key] = m.std; });
  const charts: Record<string, boolean> = {};
  CHARTS.forEach(c => { charts[c.key] = c.std; });
  const sections: Record<string, boolean> = {};
  SECTIONS.forEach(s => { sections[s.key] = true; });
  return { metrics, charts, sections };
}

/** Fills in any metric added since the settings were saved. */
export function mergeDisplay(saved: Partial<DisplaySettings> | undefined): DisplaySettings {
  const d = defaultDisplay();
  if (!saved) return d;
  return {
    metrics: { ...d.metrics, ...(saved.metrics ?? {}) },
    charts: { ...d.charts, ...(saved.charts ?? {}) },
    sections: { ...d.sections, ...(saved.sections ?? {}) },
  };
}
