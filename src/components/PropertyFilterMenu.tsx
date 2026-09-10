// The Filters popover in the Properties sub-bar.
//
// Property type lives here as well as on the sidebar chips, on purpose: the
// sidebar is hidden in List view, so the chips are unreachable there. Both
// controls read and write the same `typeFilter` state, so they can't disagree.

import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  PropertyFilters, EMPTY_FILTERS, activeFilterCount, parseNumberInput,
} from '../lib/propertyFilters';
import { SUITE_LISTING_TYPES, suiteTypeLabel } from '../lib/propertyMeta';

interface Props {
  filters: PropertyFilters;
  onChange: (f: PropertyFilters) => void;
  /** Shared with the sidebar chips: 'All' or a single property type. */
  typeFilter: string;
  propertyTypes: string[];
  onTypeFilter: (t: string) => void;
  /** Submarkets present in what this viewer can see. */
  markets: string[];
  /** Layout classes from the sub-bar (margins only). */
  className?: string;
}

export default function PropertyFilterMenu({
  filters, onChange, typeFilter, propertyTypes, onTypeFilter, markets, className = '',
}: Props) {
  const [open, setOpen] = useState(false);

  // Same dismiss behaviour as the Sort menu: a window click closes it, and the
  // wrapper stops propagation so clicks inside don't count.
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [open]);

  const count = activeFilterCount(filters) + (typeFilter !== 'All' ? 1 : 0);
  const set = (patch: Partial<PropertyFilters>) => onChange({ ...filters, ...patch });

  function clearAll() {
    onChange(EMPTY_FILTERS);
    onTypeFilter('All');
  }

  function toggleIn(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  }

  return (
    <div className={`relative shrink-0 ${className}`} style={{ zIndex: 35 }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
        style={count > 0
          ? { backgroundColor: 'rgba(212,31,39,0.08)', border: '1px solid rgba(212,31,39,0.35)', color: '#d41f27' }
          : { backgroundColor: 'white', border: '1px solid #dedad3', color: '#3a4a47' }}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="uppercase tracking-wide">Filters</span>
        {count > 0 && (
          <span className="flex items-center justify-center rounded-full text-xs font-bold tabular-nums"
            style={{ backgroundColor: '#d41f27', color: 'white', minWidth: 16, height: 16, padding: '0 4px' }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-y-auto"
          style={{
            backgroundColor: 'white', border: '1px solid #dedad3',
            zIndex: 1500, width: 340, maxHeight: '70vh',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 sticky top-0"
            style={{ backgroundColor: 'white', borderBottom: '1px solid #e5e1d8' }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#37423f' }}>Filters</p>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button onClick={clearAll} className="text-xs font-semibold" style={{ color: '#d41f27' }}>
                  Clear all
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-0.5" style={{ color: '#7a8a87' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="px-4 py-3 flex flex-col gap-4">
            <RangeField
              label="Suite Size"
              unit="SF"
              hint="Matches a building with any suite in this range."
              min={filters.suiteSfMin} max={filters.suiteSfMax}
              onMin={v => set({ suiteSfMin: v })} onMax={v => set({ suiteSfMax: v })}
            />

            <RangeField
              label="Building Size"
              unit="SF"
              min={filters.totalSfMin} max={filters.totalSfMax}
              onMin={v => set({ totalSfMin: v })} onMax={v => set({ totalSfMax: v })}
            />

            <RangeField
              label="Rate"
              unit="$/SF/yr"
              hint="Leased space only — for-sale suites quote a price per SF."
              min={filters.rateMin} max={filters.rateMax}
              onMin={v => set({ rateMin: v })} onMax={v => set({ rateMax: v })}
            />

            <Section label="Property Type">
              <div className="flex flex-wrap gap-1.5">
                {propertyTypes.map(t => (
                  <Chip key={t} active={typeFilter === t} onClick={() => onTypeFilter(t)}>{t}</Chip>
                ))}
              </div>
            </Section>

            {markets.length > 0 && (
              <Section label="Submarket" note={filters.markets.length > 0 ? `${filters.markets.length} selected` : 'Any'}>
                <div className="flex flex-wrap gap-1.5">
                  {markets.map(m => (
                    <Chip
                      key={m}
                      active={filters.markets.includes(m)}
                      onClick={() => set({ markets: toggleIn(filters.markets, m) })}
                    >
                      {m}
                    </Chip>
                  ))}
                </div>
              </Section>
            )}

            <Section label="Availability Type" note={filters.listingTypes.length > 0 ? `${filters.listingTypes.length} selected` : 'Any'}>
              <div className="flex flex-wrap gap-1.5">
                {SUITE_LISTING_TYPES.map(t => (
                  <Chip
                    key={t}
                    active={filters.listingTypes.includes(t)}
                    onClick={() => set({ listingTypes: toggleIn(filters.listingTypes, t) })}
                  >
                    {suiteTypeLabel({ listing_type: t })}
                  </Chip>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

// --- pieces -----------------------------------------------------------------

function Section({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7a8a87' }}>{label}</p>
        {note && <span className="text-xs" style={{ color: '#aaa49a' }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-150 whitespace-nowrap"
      style={active
        ? { backgroundColor: '#d41f27', color: 'white' }
        : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }}
    >
      {children}
    </button>
  );
}

function RangeField({ label, unit, hint, min, max, onMin, onMax }: {
  label: string;
  unit: string;
  hint?: string;
  min: number | null;
  max: number | null;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7a8a87' }}>{label}</p>
        <span className="text-xs" style={{ color: '#aaa49a' }}>{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <NumberInput value={min} placeholder="Min" onCommit={onMin} />
        <span className="text-xs shrink-0" style={{ color: '#aaa49a' }}>to</span>
        <NumberInput value={max} placeholder="Max" onCommit={onMax} />
      </div>
      {hint && <p className="text-xs mt-1" style={{ color: '#aaa49a' }}>{hint}</p>}
    </div>
  );
}

/**
 * Numeric field that keeps whatever the user typed.
 *
 * Reformatting on every keystroke would shove the caret to the end mid-edit,
 * so the text is local and only the parsed number travels upward. The effect
 * re-syncs when the value is changed from outside (Clear all), which is the
 * one case where the text on screen would otherwise go stale.
 */
function NumberInput({ value, placeholder, onCommit }: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const lastSent = useRef<number | null>(value);

  useEffect(() => {
    if (value !== lastSent.current) {
      setText(value == null ? '' : String(value));
      lastSent.current = value;
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      onChange={e => {
        setText(e.target.value);
        const parsed = parseNumberInput(e.target.value);
        lastSent.current = parsed;
        onCommit(parsed);
      }}
      className="w-full min-w-0 text-sm rounded-lg px-2.5 py-1.5 tabular-nums focus:outline-none transition-colors"
      style={{ backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' }}
      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = '#dedad3'; }}
    />
  );
}
