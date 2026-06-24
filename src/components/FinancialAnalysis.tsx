import { useState, useCallback } from 'react';
import { Plus, Trash2, Copy, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Property } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RentPeriod {
  id: string;
  startMonth: number;
  months: number;
  baseRate: number;
}

type AbatementType = 'base' | 'opex' | 'both';
type AbatementMode = 'sequential' | 'custom';
type EscalationMode = 'fixed' | 'annual';

interface Deal {
  id: string;
  label: string;
  linkedPropertyId: string;
  propertyName: string;
  rsf: number | '';
  commencementDate: string;
  termMonths: number | '';
  expirationDate: string;
  opex: number | '';
  escalationMode: EscalationMode;
  annualEscPct: number | '';
  periods: RentPeriod[];
  abatementType: AbatementType;
  abatementMode: AbatementMode;
  abatementMonths: number | '';
  abatementCustom: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDollar(n: number) {
  return `$${fmt(n)}`;
}

function fmtRate(n: number) {
  return `$${fmt(n)}/SF/yr`;
}

function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthsBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.round((e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}

function defaultDeal(): Deal {
  return {
    id: uid(),
    label: '',
    linkedPropertyId: '',
    propertyName: '',
    rsf: '',
    commencementDate: '',
    termMonths: 60,
    expirationDate: '',
    opex: '',
    escalationMode: 'fixed',
    annualEscPct: '',
    periods: [{ id: uid(), startMonth: 1, months: 12, baseRate: 0 }],
    abatementType: 'base',
    abatementMode: 'sequential',
    abatementMonths: 0,
    abatementCustom: '',
  };
}

// ---------------------------------------------------------------------------
// Calculation engine
// ---------------------------------------------------------------------------

interface MonthRow {
  month: number;
  baseRate: number;
  opex: number;
  grossRate: number;
  monthlyGross: number;
  abated: boolean;
  abatedMonthlyGross: number;
}

interface DealSummary {
  totalGrossFull: number;
  totalGrossAfterAbatement: number;
  avgGrossRate: number;
  effectiveGrossRate: number;
  avgBaseRate: number;
  abatedMonths: number;
  termMonths: number;
}

function buildAbatedSet(deal: Deal): Set<number> {
  const term = typeof deal.termMonths === 'number' ? deal.termMonths : 0;
  const set = new Set<number>();
  if (deal.abatementMode === 'sequential') {
    const n = typeof deal.abatementMonths === 'number' ? deal.abatementMonths : 0;
    for (let i = 1; i <= Math.min(n, term); i++) set.add(i);
  } else {
    const custom = deal.abatementCustom.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= term);
    custom.forEach(n => set.add(n));
  }
  return set;
}

function buildEscalatedRates(deal: Deal, term: number): number[] {
  const rates: number[] = new Array(term).fill(0);
  if (deal.escalationMode === 'fixed') {
    let cursor = 0;
    for (const period of deal.periods) {
      const end = Math.min(cursor + period.months, term);
      for (let i = cursor; i < end; i++) rates[i] = period.baseRate;
      cursor = end;
      if (cursor >= term) break;
    }
  } else {
    const startRate = deal.periods[0]?.baseRate ?? 0;
    const pct = typeof deal.annualEscPct === 'number' ? deal.annualEscPct / 100 : 0;
    for (let i = 0; i < term; i++) {
      const yearIdx = Math.floor(i / 12);
      rates[i] = startRate * Math.pow(1 + pct, yearIdx);
    }
  }
  return rates;
}

function computeDeal(deal: Deal): { rows: MonthRow[]; summary: DealSummary } {
  const term = typeof deal.termMonths === 'number' ? deal.termMonths : 0;
  const rsf = typeof deal.rsf === 'number' ? deal.rsf : 0;
  const opex = typeof deal.opex === 'number' ? deal.opex : 0;
  const abatedSet = buildAbatedSet(deal);
  const baseRates = buildEscalatedRates(deal, term);

  const rows: MonthRow[] = [];
  for (let i = 0; i < term; i++) {
    const month = i + 1;
    const baseRate = baseRates[i] ?? 0;
    const grossRate = baseRate + opex;
    const monthlyGross = (grossRate * rsf) / 12;
    const abated = abatedSet.has(month);

    let abatedMonthlyGross = monthlyGross;
    if (abated) {
      if (deal.abatementType === 'base') abatedMonthlyGross = (opex * rsf) / 12;
      else if (deal.abatementType === 'opex') abatedMonthlyGross = (baseRate * rsf) / 12;
      else abatedMonthlyGross = 0;
    }

    rows.push({ month, baseRate, opex, grossRate, monthlyGross, abated, abatedMonthlyGross });
  }

  const totalGrossFull = rows.reduce((s, r) => s + r.monthlyGross, 0);
  const totalGrossAfterAbatement = rows.reduce((s, r) => s + r.abatedMonthlyGross, 0);
  const avgGrossRate = term > 0 && rsf > 0 ? (totalGrossFull / term) * 12 / rsf : 0;
  const effectiveGrossRate = term > 0 && rsf > 0 ? (totalGrossAfterAbatement / term) * 12 / rsf : 0;
  const avgBaseRate = term > 0 && rsf > 0 ? baseRates.reduce((s, r) => s + r, 0) / term : 0;
  const abatedMonths = abatedSet.size;

  return { rows, summary: { totalGrossFull, totalGrossAfterAbatement, avgGrossRate, effectiveGrossRate, avgBaseRate, abatedMonths, termMonths: term } };
}

// ---------------------------------------------------------------------------
// Period table (collapsible)
// ---------------------------------------------------------------------------

function PeriodTable({ rows, deal }: { rows: MonthRow[]; deal: Deal }) {
  const [open, setOpen] = useState(false);

  // Group consecutive months with same rate into periods
  type PRow = { startMonth: number; endMonth: number; months: number; baseRate: number; opex: number; monthlyGross: number; totalGross: number; abatedTotal: number };
  const grouped: PRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    let j = i + 1;
    while (j < rows.length && rows[j].baseRate === r.baseRate) j++;
    const slice = rows.slice(i, j);
    grouped.push({
      startMonth: r.month,
      endMonth: rows[j - 1].month,
      months: j - i,
      baseRate: r.baseRate,
      opex: r.opex,
      monthlyGross: r.monthlyGross,
      totalGross: slice.reduce((s, x) => s + x.monthlyGross, 0),
      abatedTotal: slice.reduce((s, x) => s + x.abatedMonthlyGross, 0),
    });
    i = j;
  }

  return (
    <div style={{ borderTop: '1px solid rgba(136,152,147,0.15)', marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 w-full py-2 text-xs font-semibold uppercase tracking-widest transition-colors"
        style={{ color: '#889893' }}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Period detail ({grouped.length} period{grouped.length !== 1 ? 's' : ''})
      </button>
      {open && (
        <div className="overflow-x-auto rounded-lg mb-2" style={{ border: '1px solid rgba(136,152,147,0.15)' }}>
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(42,51,48,0.06)' }}>
                {['Months', 'Base Rate', 'OPEX', 'Monthly Gross', 'Total Gross', 'Abated Total'].map(h => (
                  <th key={h} className="px-2.5 py-1.5 text-left font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#889893', fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((row, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid rgba(136,152,147,0.1)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(42,51,48,0.02)' }}>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap" style={{ color: '#b5c5c1' }}>{row.startMonth}–{row.endMonth}</td>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap" style={{ color: '#e2ddd7' }}>{fmtRate(row.baseRate)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap" style={{ color: '#e2ddd7' }}>{fmtRate(row.opex)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap" style={{ color: '#e2ddd7' }}>{fmtDollar(row.monthlyGross)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap font-semibold" style={{ color: 'white' }}>{fmtDollar(row.totalGross)}</td>
                  <td className="px-2.5 py-1.5 tabular-nums whitespace-nowrap" style={{ color: '#d41f27' }}>{fmtDollar(row.abatedTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DealCard
// ---------------------------------------------------------------------------

interface DealCardProps {
  deal: Deal;
  properties: Property[];
  onChange: (id: string, patch: Partial<Deal>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function DealCard({ deal, properties, onChange, onRemove, onDuplicate }: DealCardProps) {
  const { rows, summary } = computeDeal(deal);

  function update(patch: Partial<Deal>) {
    onChange(deal.id, patch);
  }

  function handlePropertyLink(propId: string) {
    if (!propId) {
      update({ linkedPropertyId: '', propertyName: '', rsf: '' });
      return;
    }
    const prop = properties.find(p => p.id === propId);
    if (!prop) return;
    update({ linkedPropertyId: propId, propertyName: prop.name, rsf: prop.target_sf ?? prop.total_sf ?? '' });
  }

  function handleCommencementChange(val: string) {
    const term = typeof deal.termMonths === 'number' ? deal.termMonths : 0;
    const expiration = term > 0 && val ? addMonths(val, term) : deal.expirationDate;
    update({ commencementDate: val, expirationDate: expiration });
  }

  function handleTermChange(val: string) {
    const n = val === '' ? '' : parseInt(val, 10);
    if (typeof n === 'number' && !isNaN(n) && deal.commencementDate) {
      update({ termMonths: n, expirationDate: addMonths(deal.commencementDate, n) });
    } else {
      update({ termMonths: n === '' ? '' : (isNaN(n as number) ? deal.termMonths : n) });
    }
  }

  function handleExpirationChange(val: string) {
    if (val && deal.commencementDate) {
      const months = monthsBetween(deal.commencementDate, val);
      update({ expirationDate: val, termMonths: months > 0 ? months : deal.termMonths });
    } else {
      update({ expirationDate: val });
    }
  }

  function addPeriod() {
    const last = deal.periods[deal.periods.length - 1];
    const prevEnd = deal.periods.reduce((s, p) => s + p.months, 0);
    const term = typeof deal.termMonths === 'number' ? deal.termMonths : 60;
    const remaining = Math.max(12, term - prevEnd);
    update({
      periods: [...deal.periods, { id: uid(), startMonth: prevEnd + 1, months: remaining, baseRate: last?.baseRate ?? 0 }]
    });
  }

  function removePeriod(pid: string) {
    update({ periods: deal.periods.filter(p => p.id !== pid) });
  }

  function updatePeriod(pid: string, patch: Partial<RentPeriod>) {
    update({ periods: deal.periods.map(p => p.id === pid ? { ...p, ...patch } : p) });
  }

  const inputCls = "w-full rounded-md px-2.5 py-1.5 text-sm focus:outline-none transition-colors";
  const inputStyle = { backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(136,152,147,0.2)', color: 'white' };
  const labelStyle = { color: '#889893', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 600 };

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden shrink-0"
      style={{ width: 320, minWidth: 300, backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.15)' }}
    >
      {/* Deal label header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <input
          type="text"
          value={deal.label}
          onChange={e => update({ label: e.target.value })}
          placeholder="Deal label (e.g. Option A)"
          className={inputCls + ' flex-1 text-sm font-semibold'}
          style={{ ...inputStyle, fontSize: 13 }}
        />
        <button onClick={() => onDuplicate(deal.id)} title="Duplicate" className="p-1.5 rounded-lg transition-colors" style={{ color: '#889893' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'white')} onMouseLeave={e => (e.currentTarget.style.color = '#889893')}>
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onRemove(deal.id)} title="Remove" className="p-1.5 rounded-lg transition-colors" style={{ color: '#889893' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#d41f27')} onMouseLeave={e => (e.currentTarget.style.color = '#889893')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary metrics */}
      <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(136,152,147,0.15)' }}>
        <div className="px-3 py-2.5" style={{ backgroundColor: 'rgba(212,31,39,0.12)' }}>
          <p style={{ ...labelStyle, color: '#d41f27' }}>Total Gross (after abatement)</p>
          <p className="text-2xl font-extrabold tabular-nums mt-0.5" style={{ color: 'white' }}>{fmtDollar(summary.totalGrossAfterAbatement)}</p>
        </div>
        <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: 'rgba(136,152,147,0.1)' }}>
          {[
            { label: 'Total Gross (full term)', value: fmtDollar(summary.totalGrossFull) },
            { label: 'Effective Gross Rate', value: fmtRate(summary.effectiveGrossRate), accent: true },
            { label: 'Avg Gross Rate', value: fmtRate(summary.avgGrossRate) },
            { label: 'Avg Base (excl. OPEX)', value: fmtRate(summary.avgBaseRate) },
            { label: 'Abated Months', value: `${summary.abatedMonths}` },
            { label: 'Lease Term', value: `${summary.termMonths} mo` },
          ].map(({ label, value, accent }) => (
            <div key={label} className="px-3 py-2" style={{ backgroundColor: '#2a3330' }}>
              <p style={labelStyle}>{label}</p>
              <p className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: accent ? '#d41f27' : '#e2ddd7' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4" style={{ maxHeight: 600 }}>

        {/* Property & Term */}
        <Section label="Property & Term">
          <div>
            <p style={labelStyle} className="mb-1">Link to property (optional)</p>
            <select
              value={deal.linkedPropertyId}
              onChange={e => handlePropertyLink(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="">— none —</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p style={labelStyle} className="mb-1">Property name</p>
              <input
                type="text"
                value={deal.propertyName}
                onChange={e => update({ propertyName: e.target.value })}
                placeholder="Property name"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <p style={labelStyle} className="mb-1">RSF</p>
              <input
                type="number"
                value={deal.rsf}
                onChange={e => update({ rsf: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                placeholder="0"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <p style={labelStyle} className="mb-1">Commencement</p>
              <input
                type="date"
                value={deal.commencementDate}
                onChange={e => handleCommencementChange(e.target.value)}
                className={inputCls + ' text-xs'}
                style={inputStyle}
              />
            </div>
            <div>
              <p style={labelStyle} className="mb-1">Term (months)</p>
              <input
                type="number"
                value={deal.termMonths}
                onChange={e => handleTermChange(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <p style={labelStyle} className="mb-1">Expiration</p>
              <input
                type="date"
                value={deal.expirationDate}
                onChange={e => handleExpirationChange(e.target.value)}
                className={inputCls + ' text-xs'}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <p style={labelStyle} className="mb-1">OPEX ($/SF/yr)</p>
            <input
              type="number"
              step="0.01"
              value={deal.opex}
              onChange={e => update({ opex: e.target.value === '' ? '' : parseFloat(e.target.value) })}
              placeholder="0"
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </Section>

        {/* Rent Schedule */}
        <Section label="Rent Schedule">
          <div className="flex gap-2 mb-2">
            {(['fixed', 'annual'] as EscalationMode[]).map(mode => (
              <ToggleBtn key={mode} active={deal.escalationMode === mode} onClick={() => update({ escalationMode: mode })}>
                {mode === 'fixed' ? 'Fixed steps' : 'Annual %'}
              </ToggleBtn>
            ))}
          </div>

          {deal.escalationMode === 'annual' && (
            <div className="mb-2">
              <p style={labelStyle} className="mb-1">Annual escalation (%)</p>
              <input
                type="number"
                step="0.1"
                value={deal.annualEscPct}
                onChange={e => update({ annualEscPct: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                placeholder="3.0"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          )}

          <div className="space-y-2">
            {deal.periods.map((period, idx) => (
              <div key={period.id} className="flex items-end gap-1.5 rounded-lg p-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(136,152,147,0.1)' }}>
                <div className="flex-1">
                  <p style={{ ...labelStyle, fontSize: 9 }} className="mb-1">Start mo</p>
                  <input
                    type="number"
                    value={period.startMonth}
                    onChange={e => updatePeriod(period.id, { startMonth: parseInt(e.target.value) || 1 })}
                    className={inputCls}
                    style={{ ...inputStyle, fontSize: 12 }}
                    readOnly={idx === 0}
                  />
                </div>
                <div className="flex-1">
                  <p style={{ ...labelStyle, fontSize: 9 }} className="mb-1">Months</p>
                  <input
                    type="number"
                    value={period.months}
                    onChange={e => updatePeriod(period.id, { months: parseInt(e.target.value) || 1 })}
                    className={inputCls}
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                </div>
                <div className="flex-1">
                  <p style={{ ...labelStyle, fontSize: 9 }} className="mb-1">Base ($/SF/yr)</p>
                  <input
                    type="number"
                    step="0.01"
                    value={period.baseRate}
                    onChange={e => updatePeriod(period.id, { baseRate: parseFloat(e.target.value) || 0 })}
                    className={inputCls}
                    style={{ ...inputStyle, fontSize: 12 }}
                  />
                </div>
                {deal.periods.length > 1 && (
                  <button onClick={() => removePeriod(period.id)} className="mb-1.5 p-1 rounded" style={{ color: '#889893' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#d41f27')} onMouseLeave={e => (e.currentTarget.style.color = '#889893')}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {deal.escalationMode === 'fixed' && (
            <button
              onClick={addPeriod}
              className="mt-2 text-xs font-semibold transition-colors"
              style={{ color: '#d41f27' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')} onMouseLeave={e => (e.currentTarget.style.color = '#d41f27')}
            >
              + Add period
            </button>
          )}
        </Section>

        {/* Abatement */}
        <Section label="Abatement">
          <div>
            <p style={labelStyle} className="mb-1.5">Abatement type</p>
            <div className="flex gap-2">
              {(['base', 'opex', 'both'] as AbatementType[]).map(t => (
                <ToggleBtn key={t} active={deal.abatementType === t} onClick={() => update({ abatementType: t })}>
                  {t === 'base' ? 'Base only' : t === 'opex' ? 'OPEX only' : 'Base + OPEX'}
                </ToggleBtn>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            {(['sequential', 'custom'] as AbatementMode[]).map(m => (
              <ToggleBtn key={m} active={deal.abatementMode === m} onClick={() => update({ abatementMode: m })}>
                {m === 'sequential' ? 'Sequential' : 'Custom months'}
              </ToggleBtn>
            ))}
          </div>

          {deal.abatementMode === 'sequential' ? (
            <div className="mt-2">
              <p style={labelStyle} className="mb-1">Months abated from month 1</p>
              <input
                type="number"
                value={deal.abatementMonths}
                onChange={e => update({ abatementMonths: e.target.value === '' ? '' : parseInt(e.target.value) })}
                placeholder="0"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          ) : (
            <div className="mt-2">
              <p style={labelStyle} className="mb-1">Custom months (comma-separated)</p>
              <input
                type="text"
                value={deal.abatementCustom}
                onChange={e => update({ abatementCustom: e.target.value })}
                placeholder="e.g. 1, 13, 25"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          )}
        </Section>

        {/* Period detail */}
        <PeriodTable rows={rows} deal={deal} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable components
// ---------------------------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 space-y-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(136,152,147,0.12)' }}>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#889893' }}>{label}</p>
      {children}
    </div>
  );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
      style={active
        ? { backgroundColor: '#d41f27', color: 'white' }
        : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#889893', border: '1px solid rgba(136,152,147,0.2)' }
      }
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

function ComparisonTable({ deals, summaries }: { deals: Deal[]; summaries: DealSummary[] }) {
  if (deals.length === 0) return null;

  const METRICS: { label: string; key: keyof DealSummary; fmt: (v: number) => string; accent?: boolean }[] = [
    { label: 'Total gross rent (full term)', key: 'totalGrossFull', fmt: fmtDollar },
    { label: 'Total gross after abatement', key: 'totalGrossAfterAbatement', fmt: fmtDollar, accent: true },
    { label: 'Avg gross rate ($/SF/yr)', key: 'avgGrossRate', fmt: fmtRate },
    { label: 'Effective gross rate ($/SF/yr)', key: 'effectiveGrossRate', fmt: fmtRate, accent: true },
    { label: 'Avg base rate (excl. OPEX)', key: 'avgBaseRate', fmt: fmtRate },
    { label: 'Total months of abatement', key: 'abatedMonths', fmt: v => `${v}` },
    { label: 'Lease term (months)', key: 'termMonths', fmt: v => `${v}` },
  ];

  return (
    <div className="mt-8 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(136,152,147,0.15)', backgroundColor: '#2a3330' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(136,152,147,0.15)' }}>
        <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#889893' }}>Side-by-Side Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs w-48" style={{ color: '#889893' }}>Metric</th>
              {deals.map((d, i) => (
                <th key={d.id} className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs" style={{ color: '#889893' }}>
                  {d.label || `Deal ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ label, key, fmt, accent }, idx) => (
              <tr key={key} style={{ borderTop: '1px solid rgba(136,152,147,0.1)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td className="px-4 py-2.5 text-xs font-medium" style={{ color: '#b5c5c1' }}>{label}</td>
                {summaries.map((s, i) => (
                  <td key={i} className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums" style={{ color: accent ? '#d41f27' : 'white' }}>
                    {fmt(s[key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

function BarChart({ deals, summaries }: { deals: Deal[]; summaries: DealSummary[] }) {
  if (deals.length === 0) return null;
  const max = Math.max(...summaries.map(s => s.totalGrossAfterAbatement), 1);

  return (
    <div className="mt-6 rounded-2xl p-4" style={{ backgroundColor: '#2a3330', border: '1px solid rgba(136,152,147,0.15)' }}>
      <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#889893' }}>Total Gross Rent After Abatement</h3>
      <div className="flex items-end gap-4" style={{ height: 120 }}>
        {deals.map((d, i) => {
          const pct = summaries[i].totalGrossAfterAbatement / max;
          return (
            <div key={d.id} className="flex-1 flex flex-col items-center gap-1.5">
              <p className="text-xs font-semibold tabular-nums" style={{ color: '#d41f27' }}>{fmtDollar(summaries[i].totalGrossAfterAbatement)}</p>
              <div className="w-full rounded-t-lg transition-all duration-500" style={{ height: `${Math.max(pct * 80, 4)}px`, backgroundColor: '#d41f27', opacity: 0.7 + 0.3 * pct }} />
              <p className="text-xs text-center truncate w-full" style={{ color: '#889893' }}>{d.label || `Deal ${i + 1}`}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder card
// ---------------------------------------------------------------------------

function SkeletonDealCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      onClick={onAdd}
      className="flex flex-col items-center justify-center rounded-2xl shrink-0 cursor-pointer group transition-all duration-200"
      style={{ width: 320, minWidth: 300, minHeight: 420, backgroundColor: 'rgba(42,51,48,0.25)', border: '2px dashed rgba(136,152,147,0.2)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212,31,39,0.35)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(42,51,48,0.4)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(136,152,147,0.2)'; (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(42,51,48,0.25)'; }}
    >
      {/* Shimmer skeleton lines */}
      <div className="w-full px-5 mb-8 space-y-3 opacity-30">
        <div className="h-3 rounded-full" style={{ backgroundColor: 'rgba(136,152,147,0.4)', width: '70%' }} />
        <div className="h-10 rounded-xl" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />
        <div className="grid grid-cols-2 gap-2">
          {[60, 50, 75, 45].map((w, i) => (
            <div key={i} className="h-8 rounded-lg" style={{ backgroundColor: 'rgba(136,152,147,0.15)', width: `${w}%` }} />
          ))}
        </div>
        <div className="h-2 rounded-full mt-2" style={{ backgroundColor: 'rgba(136,152,147,0.2)', width: '90%' }} />
        <div className="h-2 rounded-full" style={{ backgroundColor: 'rgba(136,152,147,0.15)', width: '60%' }} />
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
          style={{ backgroundColor: 'rgba(212,31,39,0.12)', border: '1.5px solid rgba(212,31,39,0.3)' }}
        >
          <Plus className="w-5 h-5" style={{ color: '#d41f27' }} />
        </div>
        <p className="text-sm font-bold uppercase tracking-wide mt-1" style={{ color: '#889893' }}>Add Deal</p>
        <p className="text-xs" style={{ color: 'rgba(136,152,147,0.5)' }}>Compare another option</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

const EXPORT_METRICS: { label: string; key: keyof DealSummary; fmt: (v: number) => string }[] = [
  { label: 'Total Gross Rent (Full Term)', key: 'totalGrossFull', fmt: fmtDollar },
  { label: 'Total Gross After Abatement', key: 'totalGrossAfterAbatement', fmt: fmtDollar },
  { label: 'Avg Gross Rate ($/SF/yr)', key: 'avgGrossRate', fmt: fmtRate },
  { label: 'Effective Gross Rate ($/SF/yr)', key: 'effectiveGrossRate', fmt: fmtRate },
  { label: 'Avg Base Rate (excl. OPEX)', key: 'avgBaseRate', fmt: fmtRate },
  { label: 'Total Months of Abatement', key: 'abatedMonths', fmt: v => `${v}` },
  { label: 'Lease Term (Months)', key: 'termMonths', fmt: v => `${v}` },
];

function exportCSV(deals: Deal[], summaries: DealSummary[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const headers = ['Metric', ...deals.map((d, i) => d.label || `Deal ${i + 1}`)];
  const rows = EXPORT_METRICS.map(({ label, key, fmt }) => [
    label,
    ...summaries.map(s => fmt(s[key] as number)),
  ]);
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'deal-comparison.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main FinancialAnalysis component
// ---------------------------------------------------------------------------

interface FinancialAnalysisProps {
  properties: Property[];
}

export default function FinancialAnalysis({ properties }: FinancialAnalysisProps) {
  const [deals, setDeals] = useState<Deal[]>([defaultDeal()]);

  function addDeal() {
    if (deals.length >= 4) return;
    setDeals(prev => [...prev, defaultDeal()]);
  }

  function removeDeal(id: string) {
    setDeals(prev => prev.filter(d => d.id !== id));
  }

  function duplicateDeal(id: string) {
    if (deals.length >= 4) return;
    setDeals(prev => {
      const idx = prev.findIndex(d => d.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: uid(), label: prev[idx].label ? `${prev[idx].label} (copy)` : '' };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  const updateDeal = useCallback((id: string, patch: Partial<Deal>) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const computed = deals.map(d => computeDeal(d));
  const summaries = computed.map(c => c.summary);

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6" style={{ backgroundColor: '#1e2624' }}>
      <div className="max-w-[1400px] mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide" style={{ color: 'white' }}>Financial Analysis</h1>
            <p className="text-xs mt-1" style={{ color: '#889893' }}>Compare the economics of up to four deals side by side</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {deals.length > 0 && (
              <button
                onClick={() => exportCSV(deals, summaries)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
                style={{ backgroundColor: 'rgba(136,152,147,0.12)', color: '#b5c5c1', border: '1px solid rgba(136,152,147,0.2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(136,152,147,0.2)'; (e.currentTarget as HTMLElement).style.color = 'white'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(136,152,147,0.12)'; (e.currentTarget as HTMLElement).style.color = '#b5c5c1'; }}
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}
            <button
              onClick={addDeal}
              disabled={deals.length >= 4}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
              style={deals.length >= 4
                ? { backgroundColor: 'rgba(136,152,147,0.1)', color: '#889893', cursor: 'not-allowed' }
                : { backgroundColor: '#d41f27', color: 'white' }
              }
              onMouseEnter={e => { if (deals.length < 4) (e.currentTarget as HTMLElement).style.backgroundColor = '#b81920'; }}
              onMouseLeave={e => { if (deals.length < 4) (e.currentTarget as HTMLElement).style.backgroundColor = '#d41f27'; }}
            >
              Add Deal
            </button>
          </div>
        </div>

        {/* Deal cards */}
        <div className="flex gap-4 flex-wrap md:flex-nowrap overflow-x-auto pb-2">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              properties={properties}
              onChange={updateDeal}
              onRemove={removeDeal}
              onDuplicate={duplicateDeal}
            />
          ))}
          {deals.length < 4 && <SkeletonDealCard onAdd={addDeal} />}
        </div>

        {/* Comparison table */}
        <ComparisonTable deals={deals} summaries={summaries} />

        {/* Bar chart */}
        <BarChart deals={deals} summaries={summaries} />

        <div className="h-12" />
      </div>
    </div>
  );
}
