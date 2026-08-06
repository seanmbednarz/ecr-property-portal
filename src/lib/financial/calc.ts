// Calculation engine for the Financial Analysis tab.
//
// Everything derives from what the broker typed into the template — we never
// trust the workbook's cached formula results, so the dashboard and the
// spreadsheet can't drift apart.
//
// Definitions (agreed with the brokerage, and validated line-by-line against
// a real broker model):
//   Monthly gross      = (base + OpEx + direct expenses) x occupied SF / 12
//   Total occupancy    = gross rent (after free rent)
//                      + parking over the term (incl. tax, less abated months)
//                      + tenant out-of-pocket TI
//                      + other one-time cost
//                      - moving allowance and other landlord concessions
//   Net effective rent = (gross rent - TI allowance) / term / RSF, annualized
//   NPV                = monthly cash flows discounted at the client's rate

import { Deal, Stage, TermOption } from './types';

export interface StageMetrics {
  stage: Stage;
  termMonths: number;
  termYears: number;
  totalGrossRent: number;
  avgMonthlyRent: number;
  effectiveGrossRate: number;
  netEffectiveRent: number;
  startingRate: number;
  avgEscalationPct: number;
  freeRentMonths: number;
  freeRentValue: number;
  directExpTotal: number;

  parkingSpaces: number;
  reservedSpaces: number;
  unreservedSpaces: number;
  parkingMonthlyPreTax: number;
  parkingMonthlyWithTax: number;
  parkingCostOverTerm: number;
  parkingAbatedMonths: number;
  parkingAbatedValue: number;

  tiAllowancePSF: number;
  tiAllowanceTotal: number;
  tiConstructionTotal: number;
  tiOutOfPocket: number;
  tiOutOfPocketPSF: number;
  isTurnKey: boolean;

  movingAllowance: number;
  concession: number;
  otherCost: number;
  securitization: number;

  totalOccupancyCost: number;
  avgMonthlyOccupancyCost: number;
  avgMonthlyInclTI: number;
  occupancyCostPerSFYr: number;
  effectiveRateInclParking: number;
  year1Cost: number;
  totalConcessions: number;
  costPerEmployee150: number;
  costPerEmployee200: number;
  securitizationMonths: number;
  npv: number;
}

/** Occupied SF for a period — falls back to the deal's full RSF (phase-in). */
function periodSF(deal: Deal, sf: number | null): number {
  return sf != null && sf > 0 ? sf : deal.totalRSF;
}

export function computeStage(deal: Deal, stage: Stage, npvAnnualRate = 0.08): StageMetrics {
  const rsf = deal.totalRSF || 0;
  let termMonths = 0;
  let totalGrossRent = 0;
  let freeRentMonths = 0;
  let freeRentValue = 0;
  let directExpTotal = 0;
  const monthlyRentFlows: number[] = [];

  for (const p of stage.periods) {
    const months = Math.max(0, Math.round(p.months || 0));
    if (months === 0) continue;
    const sf = periodSF(deal, p.sf);
    // Free rent is recorded as base rate 0; OpEx and direct expenses still
    // apply unless the broker zeroed them too.
    const isFree = (p.baseRate || 0) === 0;
    const rate = (isFree ? 0 : (p.baseRate || 0)) + (p.opex || 0) + (p.directExp || 0);
    const paidMonthly = rate * sf / 12;

    for (let i = 0; i < months; i++) monthlyRentFlows.push(paidMonthly);
    termMonths += months;
    totalGrossRent += paidMonthly * months;
    directExpTotal += (p.directExp || 0) * sf / 12 * months;
    if (isFree) freeRentMonths += months;
  }

  // The template records abated months as base rate 0, so there's no
  // "would-have-paid" rate on the row. Benchmark against the first paying
  // period — that's the rent the abatement defers.
  const paidPeriods = stage.periods.filter(p => (p.baseRate || 0) > 0 && (p.months || 0) > 0);
  const firstPaid = paidPeriods[0];
  if (firstPaid && freeRentMonths > 0) {
    freeRentValue = (firstPaid.baseRate || 0) * periodSF(deal, firstPaid.sf) / 12 * freeRentMonths;
  }

  const avgMonthlyRent = termMonths ? totalGrossRent / termMonths : 0;
  const effectiveGrossRate = termMonths && rsf ? (avgMonthlyRent * 12) / rsf : 0;
  const startingRate = firstPaid
    ? (firstPaid.baseRate || 0) + (firstPaid.opex || 0) + (firstPaid.directExp || 0)
    : 0;

  // Compound annual growth between the first and last paying base rate.
  let avgEscalationPct = 0;
  if (paidPeriods.length > 1) {
    const first = paidPeriods[0].baseRate || 0;
    const last = paidPeriods[paidPeriods.length - 1].baseRate || 0;
    const spanYears = Math.max(1, termMonths / 12 - 1);
    if (first > 0 && last > 0) avgEscalationPct = (Math.pow(last / first, 1 / spanYears) - 1) * 100;
  }

  // --- Parking: reserved and unreserved priced separately -------------------
  const reservedSpaces = stage.reservedSpaces || 0;
  const unreservedSpaces = stage.unreservedSpaces || 0;
  const parkingSpaces = reservedSpaces + unreservedSpaces;
  const parkingMonthlyPreTax =
    reservedSpaces * (stage.reservedRate || 0) + unreservedSpaces * (stage.unreservedRate || 0);
  const parkingMonthlyWithTax = parkingMonthlyPreTax * (1 + (deal.parkingTaxRate || 0));
  const parkingAbatedMonths = Math.min(Math.max(0, stage.parkAbatedMonths || 0), termMonths);
  const parkingCostOverTerm = parkingMonthlyWithTax * Math.max(0, termMonths - parkingAbatedMonths);
  const parkingAbatedValue = parkingMonthlyWithTax * parkingAbatedMonths;

  // --- TI -------------------------------------------------------------------
  const tiAllowancePSF = stage.tiAllowancePSF || 0;
  const tiAllowanceTotal = tiAllowancePSF * rsf;
  const tiConstructionTotal = (stage.tiConstructionPSF || 0) * rsf;
  const tiOutOfPocket = Math.max(0, tiConstructionTotal - tiAllowanceTotal);
  const tiOutOfPocketPSF = rsf ? tiOutOfPocket / rsf : 0;
  const isTurnKey = tiAllowancePSF === 0 && (stage.tiConstructionPSF || 0) === 0;

  // --- Credits and one-time costs -------------------------------------------
  const movingAllowance = stage.movingAllowance || 0;
  const concession = stage.concession || 0;
  const otherCost = stage.otherCost || 0;
  const securitization = stage.securitization || 0;

  const totalOccupancyCost =
    totalGrossRent + parkingCostOverTerm + tiOutOfPocket + otherCost - movingAllowance - concession;
  const avgMonthlyOccupancyCost = termMonths ? totalOccupancyCost / termMonths : 0;
  const avgMonthlyInclTI = termMonths ? (totalGrossRent + tiOutOfPocket) / termMonths : 0;
  const occupancyCostPerSFYr = termMonths && rsf ? (totalOccupancyCost / termMonths) * 12 / rsf : 0;
  const effectiveRateInclParking = termMonths && rsf
    ? ((totalGrossRent + parkingCostOverTerm) / termMonths) * 12 / rsf : 0;
  const netEffectiveRent = termMonths && rsf
    ? ((totalGrossRent - tiAllowanceTotal) / termMonths) * 12 / rsf : 0;

  // Year one out-of-pocket for rent + parking.
  const y1Rent = monthlyRentFlows.slice(0, 12).reduce((a, b) => a + b, 0);
  const y1ParkingMonths = Math.max(0, Math.min(12, termMonths) - Math.min(12, parkingAbatedMonths));
  const year1Cost = y1Rent + parkingMonthlyWithTax * y1ParkingMonths;

  const totalConcessions =
    freeRentValue + tiAllowanceTotal + parkingAbatedValue + movingAllowance + concession;
  const costPerEmployee150 = rsf ? totalOccupancyCost / (rsf / 150) : 0;
  const costPerEmployee200 = rsf ? totalOccupancyCost / (rsf / 200) : 0;
  const securitizationMonths = avgMonthlyRent ? securitization / avgMonthlyRent : 0;

  // NPV: monthly rent + parking discounted; up-front items land at month 0.
  const r = npvAnnualRate / 12;
  let npv = tiOutOfPocket + otherCost - movingAllowance - concession;
  for (let m = 0; m < monthlyRentFlows.length; m++) {
    const parking = m < parkingAbatedMonths ? 0 : parkingMonthlyWithTax;
    npv += (monthlyRentFlows[m] + parking) / Math.pow(1 + r, m + 1);
  }

  return {
    stage, termMonths, termYears: termMonths / 12,
    totalGrossRent, avgMonthlyRent, effectiveGrossRate, netEffectiveRent,
    startingRate, avgEscalationPct, freeRentMonths, freeRentValue, directExpTotal,
    parkingSpaces, reservedSpaces, unreservedSpaces,
    parkingMonthlyPreTax, parkingMonthlyWithTax, parkingCostOverTerm,
    parkingAbatedMonths, parkingAbatedValue,
    tiAllowancePSF, tiAllowanceTotal, tiConstructionTotal, tiOutOfPocket, tiOutOfPocketPSF, isTurnKey,
    movingAllowance, concession, otherCost, securitization,
    totalOccupancyCost, avgMonthlyOccupancyCost, avgMonthlyInclTI,
    occupancyCostPerSFYr, effectiveRateInclParking, year1Cost, totalConcessions,
    costPerEmployee150, costPerEmployee200, securitizationMonths, npv,
  };
}

/** Cumulative occupancy cost month by month — drives the cost-over-time chart. */
export function cumulativeCurve(deal: Deal, stage: Stage): number[] {
  const m = computeStage(deal, stage);
  const out: number[] = [];
  let running = m.tiOutOfPocket + m.otherCost - m.movingAllowance - m.concession;
  let month = 0;
  for (const p of stage.periods) {
    const months = Math.max(0, Math.round(p.months || 0));
    const sf = periodSF(deal, p.sf);
    const isFree = (p.baseRate || 0) === 0;
    const rate = (isFree ? 0 : (p.baseRate || 0)) + (p.opex || 0) + (p.directExp || 0);
    const monthly = rate * sf / 12;
    for (let i = 0; i < months; i++) {
      const parking = month < m.parkingAbatedMonths ? 0 : m.parkingMonthlyWithTax;
      running += monthly + parking;
      out.push(running);
      month++;
    }
  }
  return out;
}

/** The stage a term option currently stands at (the last one filled in). */
export function latestStage(option: TermOption): Stage | null {
  return option.stages.length ? option.stages[option.stages.length - 1] : null;
}

/** Most recent stage proposed by a given side — mirrors the Summary tab. */
export function latestStageBy(option: TermOption, party: 'landlord' | 'tenant'): Stage | null {
  for (let i = option.stages.length - 1; i >= 0; i--) {
    if (option.stages[i].party === party) return option.stages[i];
  }
  return null;
}

/**
 * What the negotiation has moved on total occupancy cost, measured against the
 * landlord's opening proposal. Positive = savings.
 */
export function savingsVsOpening(
  deal: Deal, option: TermOption, current: StageMetrics, rate = 0.08,
): number | null {
  const opening = option.stages.find(s => s.party === 'landlord');
  if (!opening || opening === current.stage) return null;
  return computeStage(deal, opening, rate).totalOccupancyCost - current.totalOccupancyCost;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const psf = (n: number) => `$${n.toFixed(2)}`;
export const sf = (n: number) => Math.round(n).toLocaleString('en-US');
