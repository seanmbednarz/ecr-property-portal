import { Heart, MessageSquare, MapPin, Building, Pencil } from 'lucide-react';
import { Property } from '../types';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';

interface PropertyListSidebarProps {
  properties: Property[];
  selectedId: string | null;
  favorites: Set<string>;
  notesCounts: Record<string, number>;
  typeFilter: string;
  propertyTypes: string[];
  isAdmin?: boolean;
  onSelect: (p: Property) => void;
  onOpenDetail: (p: Property) => void;
  onTypeFilter: (t: string) => void;
  onFavoriteToggle: (id: string, current: boolean) => void;
  onEdit?: (p: Property) => void;
}

const TYPE_COLORS: Record<string, string> = {
  'Office':                  '#383b3b',
  'Industrial':              '#616665',
  'Medical Office':          '#501e2c',
  'Land':                    '#92855a',
  'Mixed-Use':               '#7a6442',
  'Retail':                  '#905339',
  'Flex':                    '#6c617d',
  'Executive Office Suites': '#3a4551',
};
const DEFAULT_PIN_COLOR = '#383b3b';

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_PIN_COLOR;
}

export default function PropertyListSidebar({
  properties,
  selectedId,
  favorites,
  notesCounts,
  typeFilter,
  propertyTypes,
  isAdmin,
  onSelect,
  onOpenDetail,
  onTypeFilter,
  onFavoriteToggle,
  onEdit,
}: PropertyListSidebarProps) {
  return (
    <aside
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'white', borderRight: '1px solid #e5e1d8' }}
    >
      {/* Filter pills */}
      <div className="px-3 py-2.5 flex flex-wrap gap-1.5" style={{ borderBottom: '1px solid #e5e1d8' }}>
        {propertyTypes.map(t => (
          <button
            key={t}
            onClick={() => onTypeFilter(t)}
            className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-150 whitespace-nowrap"
            style={typeFilter === t
              ? { backgroundColor: '#d41f27', color: 'white' }
              : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }
            }
          >
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs self-center tabular-nums" style={{ color: '#aaa49a' }}>
          {properties.length}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
            <Building className="w-8 h-8" style={{ color: '#c8c3b8' }} />
            <p className="text-sm" style={{ color: '#aaa49a' }}>No properties</p>
          </div>
        ) : (
          properties.map((p, i) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(p)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); } }}
              className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 transition-colors duration-150 group cursor-pointer"
              style={
                selectedId === p.id
                  ? { backgroundColor: 'rgba(212,31,39,0.05)', borderLeft: '2px solid #d41f27', borderBottom: '1px solid #f0ede8' }
                  : { borderLeft: '2px solid transparent', borderBottom: '1px solid #f0ede8' }
              }
              onMouseEnter={(e) => { if (selectedId !== p.id) (e.currentTarget as HTMLElement).style.backgroundColor = '#faf9f7'; }}
              onMouseLeave={(e) => { if (selectedId !== p.id) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              {/* Index */}
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                style={selectedId === p.id
                  ? { backgroundColor: '#d41f27', color: 'white' }
                  : { backgroundColor: typeColor(p.property_type), color: 'white' }
                }
              >
                {i + 1}
              </span>

              {/* Thumbnail */}
              <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden" style={{ backgroundColor: '#e5e1d8' }}>
                <SidebarThumb property={p} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs font-medium mb-0.5 uppercase tracking-wide" style={{ color: '#7a8a87' }}>
                      {p.property_type}
                    </p>
                    <p className="text-sm font-semibold leading-tight truncate" style={{ color: '#1e2624' }}>
                      {p.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    {notesCounts[p.id] > 0 && (
                      <span className="flex items-center gap-0.5 text-xs" style={{ color: '#7a8a87' }}>
                        <MessageSquare className="w-3 h-3" />
                        {notesCounts[p.id]}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onFavoriteToggle(p.id, favorites.has(p.id)); }}
                      className="p-0.5"
                    >
                      <Heart
                        className="w-3.5 h-3.5 transition-colors"
                        fill={favorites.has(p.id) ? '#d41f27' : 'none'}
                        stroke={favorites.has(p.id) ? '#d41f27' : '#c8c3b8'}
                      />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1" style={{ color: '#aaa49a' }}>
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  <span className="text-xs truncate">{p.market}</span>
                </div>
                {p.total_sf && (
                  <p className="text-xs mt-0.5 tabular-nums" style={{ color: '#7a8a87' }}>
                    {p.total_sf.toLocaleString()} SF
                  </p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenDetail(p); }}
                  className="text-xs font-semibold mt-1.5 transition-colors"
                  style={{ color: '#d41f27' }}
                >
                  View Details →
                </button>
                {isAdmin && onEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                    className="flex items-center gap-1 text-xs font-semibold mt-1 transition-colors"
                    style={{ color: '#7a8a87' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#3a4a47')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#7a8a87')}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function SidebarThumb({ property }: { property: Property }) {
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const src = photos[0] ?? property.hero_image_url ?? null;
  if (!src) return <div className="w-full h-full" style={{ backgroundColor: '#1e2624' }} />;
  return <img src={src} alt="" className="w-full h-full object-cover" />;
}
