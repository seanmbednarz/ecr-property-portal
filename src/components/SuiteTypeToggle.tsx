import { SuiteListingType } from '../types';
import { SUITE_LISTING_TYPES, suiteTypeLabel, suiteTypeColor } from '../lib/propertyMeta';

// Per-suite listing-type switch used by the add and edit property forms. Lease
// is the default. Picking Sale swaps op. exp. for a sale price on the row and
// makes the suite render in the detail page's For Sale table; sublease and
// coworking quote rent like lease and only change the label.
export default function SuiteTypeToggle({ value, onChange }: {
  value: SuiteListingType;
  onChange: (t: SuiteListingType) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {SUITE_LISTING_TYPES.map(t => {
        const on = value === t;
        const color = suiteTypeColor({ listing_type: t });
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors"
            style={on
              ? { backgroundColor: `${color}14`, color, border: `1px solid ${color}4d` }
              : { color: '#9aaba8', border: '1px solid #dedad3', backgroundColor: 'white' }}
          >
            {suiteTypeLabel({ listing_type: t })}
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
