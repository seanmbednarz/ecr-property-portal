// Property filtering for the Properties tab.
//
// Two levels of criteria live here, and the difference matters:
//
//   property-level (building size, submarket) — asked of the property itself
//   suite-level    (suite size, rate, listing type) — asked of each suite
//
// A property passes a suite-level filter when ANY of its visible suites
// passes. The non-matching suites stay on screen: hiding them would quietly
// misrepresent the building, and a screenshot of a card would read as though
// the matching suite were all there is. Instead the UI highlights the suites
// that matched (see matchedSuiteIds in Dashboard).
//
// "Visible suites" always means suites already filtered by suitesForClient —
// a suite tagged for another client must never make a property match, or its
// existence leaks through the result count.

import { Suite } from '../types';
import { isSaleSuite } from './propertyMeta';

export interface PropertyFilters {
  /** Size of an individual available suite, in SF. */
  suiteSfMin: number | null;
  suiteSfMax: number | null;
  /** Size of the whole building, in SF. */
  totalSfMin: number | null;
  totalSfMax: number | null;
  /**
   * Largest single block of adjoining space, in SF — properties.max_contiguous_sf.
   *
   * This is a different question from suite size and must not be confused with
   * it. A building can offer 250,000 SF across ten scattered floors and still
   * have no block bigger than 30,000; a tenant who needs 100,000 together cares
   * only about the block. Suite-size filters can't answer that, because a
   * summary row entered as a suite ("Total Available") looks exactly like a
   * real suite.
   */
  maxContiguousMin: number | null;
  maxContiguousMax: number | null;
  /** Asking rate in $/SF/yr. Lease-style suites only — see rateOfSuite. */
  rateMin: number | null;
  rateMax: number | null;
  /** Submarkets to include. Empty = no submarket restriction. */
  markets: string[];
  /** Suite listing types to include. Empty = no restriction. */
  listingTypes: string[];
}

export const EMPTY_FILTERS: PropertyFilters = {
  suiteSfMin: null,
  suiteSfMax: null,
  totalSfMin: null,
  totalSfMax: null,
  maxContiguousMin: null,
  maxContiguousMax: null,
  rateMin: null,
  rateMax: null,
  markets: [],
  listingTypes: [],
};

/** Reads a typed number, tolerating thousands separators and stray spaces. */
export function parseNumberInput(raw: string): number | null {
  const cleaned = raw.replace(/[,\s$]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function inRange(value: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  // An unknown value can't be shown to satisfy a range the user asked for.
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/**
 * The rate a suite should be judged on, or null if it has none comparable.
 *
 * Sale suites are deliberately excluded: they quote base_rent as a purchase
 * price per SF (~$250/SF) while lease suites quote an annual rent (~$30/SF/yr).
 * Letting one range filter span both would make "under $40" match every
 * building for lease and no building for sale, for no reason a user could see.
 */
function rateOfSuite(s: Suite): number | null {
  if (isSaleSuite(s)) return null;
  return s.base_rent;
}

/** True when any criterion is asked of individual suites rather than the property. */
export function hasSuiteCriteria(f: PropertyFilters): boolean {
  return f.suiteSfMin != null || f.suiteSfMax != null
    || f.rateMin != null || f.rateMax != null
    || f.listingTypes.length > 0;
}

/** Does this one suite satisfy every suite-level criterion? */
export function suiteMatches(s: Suite, f: PropertyFilters): boolean {
  if (!inRange(s.sf, f.suiteSfMin, f.suiteSfMax)) return false;
  if (f.rateMin != null || f.rateMax != null) {
    if (!inRange(rateOfSuite(s), f.rateMin, f.rateMax)) return false;
  }
  if (f.listingTypes.length > 0 && !f.listingTypes.includes(s.listing_type ?? 'lease')) return false;
  return true;
}

/**
 * Does this property survive the filters?
 *
 * `suites` must already be narrowed to what the current viewer may see.
 */
export function propertyMatches(
  p: {
    total_sf?: number | null;
    max_contiguous_sf?: number | null;
    market?: string | null;
    suites?: Suite[];
  },
  f: PropertyFilters,
): boolean {
  if (!inRange(p.total_sf, f.totalSfMin, f.totalSfMax)) return false;
  // A property with no recorded contiguous block can't be shown to satisfy a
  // contiguous requirement. Saying "unknown" is the honest answer here: the
  // alternative — falling back to suite sizes — is exactly the confusion this
  // filter exists to end.
  if (!inRange(p.max_contiguous_sf, f.maxContiguousMin, f.maxContiguousMax)) return false;
  if (f.markets.length > 0 && !f.markets.includes(p.market ?? '')) return false;
  // A building with nothing available can't satisfy a question about suites.
  if (hasSuiteCriteria(f)) {
    return (p.suites ?? []).some(s => suiteMatches(s, f));
  }
  return true;
}

/**
 * How many filters are switched on, for the "Filters · 2" badge. Each range
 * counts once whether one end or both are set — the user set one idea, not two.
 */
export function activeFilterCount(f: PropertyFilters): number {
  let n = 0;
  if (f.suiteSfMin != null || f.suiteSfMax != null) n++;
  if (f.totalSfMin != null || f.totalSfMax != null) n++;
  if (f.maxContiguousMin != null || f.maxContiguousMax != null) n++;
  if (f.rateMin != null || f.rateMax != null) n++;
  if (f.markets.length > 0) n++;
  if (f.listingTypes.length > 0) n++;
  return n;
}
