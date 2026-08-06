// Shared types for the Financial Analysis tab (Phase 1 — browser-only).
//
// Mirrors the standardized ECR Deal Analysis template: one deal per workbook
// tab, each deal carrying up to 2 TERM OPTIONS (e.g. a 5-year and a 3-year
// quote), and each term option carrying up to 10 negotiation STAGES.

export type DealType =
  | 'New Lease' | 'Renewal' | 'Sublease' | 'Expansion'
  | 'Expansion & Extension' | 'Reduction' | 'Purchase' | string;
export type RentStructure = 'FSG' | 'NNN' | 'MG' | string;
export type Party = 'landlord' | 'tenant';

export interface RentPeriod {
  /** Human label for the period, e.g. "1-12". */
  mos: string;
  /** Number of months this period runs. */
  months: number;
  /** Occupied SF this period; null means the deal's full RSF (phase-in). */
  sf: number | null;
  /** Base rent, $/SF/yr. 0 = free-rent period (OpEx may still apply). */
  baseRate: number;
  /** Operating expenses billed through the landlord, $/SF/yr. */
  opex: number;
  /**
   * Costs the tenant pays directly to a provider rather than through the
   * landlord's OpEx — metered electricity, janitorial, etc. Common on
   * industrial, flex and some medical space.
   */
  directExp: number;
}

export interface Stage {
  /** 0-based position of the stage block in the sheet (stage 1 = index 0). */
  index: number;
  label: string;
  party: Party;
  commence: string;
  /** Phase-in is per stage — it can change from one proposal to the next. */
  phaseIn: boolean;
  phaseSF: number | null;
  periods: RentPeriod[];

  /** Parking spaces per 1,000 RSF. */
  parkRatio: number;
  reservedSpaces: number;
  reservedRate: number;
  /** Typed over by the broker when the client won't take the full ratio. */
  unreservedSpaces: number;
  unreservedRate: number;
  parkAbatedMonths: number;

  /** Landlord TI allowance, $/SF (0 with construction 0 => Turn-Key). */
  tiAllowancePSF: number;
  /** Estimated construction cost, $/SF. */
  tiConstructionPSF: number;

  /** Landlord credits — these reduce total occupancy cost. */
  movingAllowance: number;
  concessionDesc: string;
  concession: number;
  /** Tenant one-time expense — increases total occupancy cost. */
  otherCost: number;
  otherDesc: string;

  termination: string;
  renewal: string;
  /** Deposit / LOC amount, plus its terms. */
  securitization: number;
  securitizationTerms: string;
  notes: string;
}

export interface TermOption {
  /** 0-based section index (Term Option 1 = 0). */
  index: number;
  /** Broker's name for the option, e.g. "5-Year Term". */
  label: string;
  stages: Stage[];
}

export interface Deal {
  id: string;
  tabName: string;
  name: string;
  address: string;
  building: string;
  type: DealType;
  structure: RentStructure;
  suites: { name: string; rsf: number }[];
  totalRSF: number;
  /** Parking tax rate as a decimal, e.g. 0.0825 (0 for exempt tenants). */
  parkingTaxRate: number;
  options: TermOption[];
}

/**
 * One column of the comparison: a specific term option of a specific deal.
 * A deal quoting two term lengths produces two of these.
 */
export interface DealOptionRef {
  deal: Deal;
  option: TermOption;
  /** Stable key: `${dealId}::${optionIndex}`. */
  key: string;
}

export function optionKey(dealId: string, optionIndex: number) {
  return `${dealId}::${optionIndex}`;
}

/** Column heading: "Ridgeline Tower — 5-Year Term" (name alone if single option). */
export function optionTitle(deal: Deal, option: TermOption, multi: boolean) {
  if (!multi) return deal.name;
  return option.label ? `${deal.name} — ${option.label}` : `${deal.name} — Option ${option.index + 1}`;
}

export interface ParseResult {
  deals: Deal[];
  warnings: string[];
}
