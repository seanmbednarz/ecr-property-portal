import { SuiteListingType } from '../types';

// Per-suite lease/sale switch used by the add and edit property forms. Lease
// is the default; picking Sale swaps op. exp. for a sale price on the row and
// makes the suite render in the detail page's For Sale table.
export default function SuiteTypeToggle({ value, onChange }: {
  value: SuiteListingType;
  onChange: (t: SuiteListingType) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {(['lease', 'sale'] as SuiteListingType[]).map(t => {
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors"
            style={on
              ? { backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.3)' }
              : { color: '#9aaba8', border: '1px solid #dedad3', backgroundColor: 'white' }}
          >
            {t === 'lease' ? 'For Lease' : 'For Sale'}
          </button>
        );
      })}
    </div>
  );
}

// Shows the auto-computed price/SF × SF so an admin only fills Sale Price in
// when the headline number differs from the math.
export function salePricePlaceholder(s: { base_rent: string; sf: string }): string {
  const rate = parseFloat(s.base_rent);
  const sf = parseFloat(s.sf);
  if (!isFinite(rate) || !isFinite(sf)) return '5,740,000';
  return `${Math.round(rate * sf).toLocaleString()} (auto)`;
}
