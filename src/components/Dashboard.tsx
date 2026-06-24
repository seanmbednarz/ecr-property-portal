import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Property } from '../types';
import Header from './Header';
import PropertyListSidebar from './PropertyListSidebar';
import MapView from './MapView';
import PropertyDetailPage from './PropertyDetailPage';
import NotesDrawer from './NotesDrawer';
import { Search, ChevronDown, Check, LayoutList, Map as MapIcon, X, Download } from 'lucide-react';
import ECRLogo from '../assets/ECR_Logo.svg';
import PatrickPhoto from '../assets/Patrick_Ley_-_Square.jpg';
import RossPhoto from '../assets/Ross_Chumley_-_Square.jpg';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';

interface DashboardProps {
  userEmail: string;
}

type SortKey = 'featured' | 'size_desc' | 'size_asc' | 'rate_desc' | 'rate_asc' | 'north_south' | 'south_north' | 'east_west' | 'west_east';
type MobileTab = 'list' | 'map';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'size_desc', label: 'Size · High → Low' },
  { key: 'size_asc', label: 'Size · Low → High' },
  { key: 'rate_desc', label: 'Rate · High → Low' },
  { key: 'rate_asc', label: 'Rate · Low → High' },
  { key: 'north_south', label: 'North → South' },
  { key: 'south_north', label: 'South → North' },
  { key: 'east_west', label: 'East → West' },
  { key: 'west_east', label: 'West → East' },
];

export default function Dashboard({ userEmail }: DashboardProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [notesCounts, setNotesCounts] = useState<Record<string, number>>({});
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [notesProperty, setNotesProperty] = useState<Property | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('featured');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('list');

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = () => setShowSortMenu(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showSortMenu]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([fetchProperties(), fetchFavorites(), fetchNotesCounts()]);
    setLoading(false);
  }

  async function fetchProperties() {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        *,
        suites:property_suites(*),
        brokers:property_brokers(broker:brokers(*))
      `);
    if (!error && data) {
      const mapped = (data as any[]).map(p => ({
        ...p,
        suites: (p.suites ?? []).sort((a: any, b: any) => a.display_order - b.display_order),
        brokers: (p.brokers ?? []).map((pb: any) => pb.broker).filter(Boolean).sort((a: any, b: any) => a.display_order - b.display_order),
      }));
      setProperties(mapped);
    }
  }

  async function fetchFavorites() {
    const { data } = await supabase.from('user_favorites').select('property_id');
    if (data) setFavorites(new Set((data as any[]).map(f => f.property_id)));
  }

  async function fetchNotesCounts() {
    const { data } = await supabase.from('property_notes').select('property_id');
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data as any[]) {
        counts[row.property_id] = (counts[row.property_id] ?? 0) + 1;
      }
      setNotesCounts(counts);
    }
  }

  async function handleFavoriteToggle(propertyId: string, current: boolean) {
    if (current) {
      await supabase.from('user_favorites').delete().eq('property_id', propertyId);
      setFavorites(prev => { const s = new Set(prev); s.delete(propertyId); return s; });
    } else {
      await supabase.from('user_favorites').insert({ property_id: propertyId });
      setFavorites(prev => new Set([...prev, propertyId]));
    }
  }

  function handleNotesCountChange(propertyId: string, count: number) {
    setNotesCounts(prev => ({ ...prev, [propertyId]: count }));
  }

  function handleTypeFilter(t: string) {
    setTypeFilter(t);
    setSelectedProperty(null);
  }

  const propertyTypes = ['All', ...Array.from(new Set(properties.map(p => p.property_type)))];

  const filtered = useMemo(() => properties
    .filter(p => {
      if (showFavoritesOnly && !favorites.has(p.id)) return false;
      if (typeFilter !== 'All' && p.property_type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          (p.market ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'size_desc') return (b.total_sf ?? 0) - (a.total_sf ?? 0);
      if (sortKey === 'size_asc') return (a.total_sf ?? 0) - (b.total_sf ?? 0);
      if (sortKey === 'rate_desc' || sortKey === 'rate_asc') {
        const rateOf = (p: typeof a) => {
          const rates = (p.suites ?? []).map(s => s.base_rent).filter((r): r is number => r != null);
          return rates.length ? Math.max(...rates) : null;
        };
        const ra = rateOf(a);
        const rb = rateOf(b);
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return sortKey === 'rate_desc' ? rb - ra : ra - rb;
      }
      if (sortKey === 'north_south') return (b.lat ?? -90) - (a.lat ?? -90);
      if (sortKey === 'south_north') return (a.lat ?? -90) - (b.lat ?? -90);
      if (sortKey === 'east_west') return (a.lng ?? 180) - (b.lng ?? 180);
      if (sortKey === 'west_east') return (b.lng ?? 180) - (a.lng ?? 180);
      return 0;
    }), [properties, showFavoritesOnly, favorites, typeFilter, searchQuery, sortKey]);

  if (detailProperty) {
    return (
      <>
        <PropertyDetailPage
          property={detailProperty}
          isFavorited={favorites.has(detailProperty.id)}
          notesCount={notesCounts[detailProperty.id] ?? 0}
          onBack={() => setDetailProperty(null)}
          onFavoriteToggle={handleFavoriteToggle}
          onOpenNotes={(p) => setNotesProperty(p)}
        />
        {notesProperty && (
          <NotesDrawer
            property={notesProperty}
            userEmail={userEmail}
            onClose={() => setNotesProperty(null)}
            onNotesCountChange={handleNotesCountChange}
          />
        )}
      </>
    );
  }

  const loadingSpinner = (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: '100dvh', backgroundColor: '#f0ede8' }}>
      <Header
        userEmail={userEmail}
        favoritesCount={favorites.size}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavorites={() => setShowFavoritesOnly(v => !v)}
      />

      {/* Sub-bar: search + sort */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ backgroundColor: '#f0ede8', borderBottom: '1px solid #dedad3' }}
      >
        {/* Favorites toggle (mobile only — hidden on sm+ where Header has it) */}
        <button
          onClick={() => setShowFavoritesOnly(v => !v)}
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors"
          style={showFavoritesOnly
            ? { backgroundColor: 'rgba(212,31,39,0.12)', color: '#d41f27' }
            : { backgroundColor: 'white', color: '#7a8a87', border: '1px solid #dedad3' }
          }
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#7a8a87' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search properties…"
            className="w-full text-sm rounded-lg pl-8 pr-3 py-1.5 focus:outline-none transition-colors"
            style={{ backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#dedad3'; }}
          />
        </div>

        <span className="hidden sm:block text-xs tabular-nums shrink-0" style={{ color: '#9aaba8' }}>
          Showing <span style={{ color: '#3a4a47' }}>{filtered.length}</span> / {properties.length}
        </span>

        <div className="relative ml-auto" style={{ zIndex: 1500 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowSortMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
            style={{ backgroundColor: 'white', border: '1px solid #dedad3', color: '#3a4a47' }}
          >
            <span className="hidden sm:inline uppercase tracking-wider text-xs" style={{ color: '#7a8a87' }}>Sort By</span>
            <span className="uppercase tracking-wide">{SORT_OPTIONS.find(s => s.key === sortKey)?.label}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: '#7a8a87' }} />
          </button>

          {showSortMenu && (
            <div
              className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden min-w-[200px]"
              style={{ backgroundColor: 'white', border: '1px solid #dedad3', zIndex: 1500 }}
            >
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                  style={sortKey === opt.key
                    ? { color: '#d41f27', backgroundColor: 'rgba(212,31,39,0.05)' }
                    : { color: '#3a4a47' }
                  }
                  onMouseEnter={(e) => { if (sortKey !== opt.key) e.currentTarget.style.backgroundColor = '#f7f5f1'; }}
                  onMouseLeave={(e) => { if (sortKey !== opt.key) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span className="uppercase tracking-wide text-xs">{opt.label}</span>
                  {sortKey === opt.key && <Check className="w-3.5 h-3.5" style={{ color: '#d41f27' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Desktop sidebar (hidden on mobile) */}
        <div className="w-72 shrink-0 hidden md:flex flex-col h-full">
          {loading ? loadingSpinner : (
            <PropertyListSidebar
              properties={filtered}
              selectedId={selectedProperty?.id ?? null}
              favorites={favorites}
              notesCounts={notesCounts}
              typeFilter={typeFilter}
              propertyTypes={propertyTypes}
              onSelect={(p) => setSelectedProperty(prev => prev?.id === p.id ? null : p)}
              onOpenDetail={setDetailProperty}
              onTypeFilter={handleTypeFilter}
              onFavoriteToggle={handleFavoriteToggle}
            />
          )}
        </div>

        {/* Mobile list view (full-width, only when list tab is active) */}
        <div className={`md:hidden flex-col h-full overflow-hidden ${mobileTab === 'list' ? 'flex flex-1' : 'hidden'}`}>
          {loading ? loadingSpinner : (
            <PropertyListSidebar
              properties={filtered}
              selectedId={null}
              favorites={favorites}
              notesCounts={notesCounts}
              typeFilter={typeFilter}
              propertyTypes={propertyTypes}
              onSelect={setDetailProperty}
              onOpenDetail={setDetailProperty}
              onTypeFilter={handleTypeFilter}
              onFavoriteToggle={handleFavoriteToggle}
            />
          )}
        </div>

        {/* Map */}
        <div className={`flex-1 relative min-w-0 ${mobileTab === 'list' ? 'hidden md:block' : 'block'}`}>
          <MapView
            properties={filtered}
            selectedId={selectedProperty?.id ?? null}
            onSelect={(p) => setSelectedProperty(prev => prev?.id === p.id ? null : p)}
          />
        </div>

        {/* Desktop QuickView (right panel, hidden below lg) */}
        {selectedProperty && (
          <div
            className="w-[26rem] shrink-0 hidden lg:flex flex-col overflow-y-auto"
            style={{ backgroundColor: 'white', borderLeft: '1px solid #dedad3' }}
          >
            <QuickView
              property={selectedProperty}
              isFavorited={favorites.has(selectedProperty.id)}
              notesCount={notesCounts[selectedProperty.id] ?? 0}
              onOpenDetail={setDetailProperty}
              onFavoriteToggle={handleFavoriteToggle}
              onOpenNotes={setNotesProperty}
              onClose={() => setSelectedProperty(null)}
            />
          </div>
        )}

        {/* Mobile bottom sheet (map tab + property selected) */}
        {selectedProperty && mobileTab === 'map' && (
          <div className="md:hidden absolute bottom-0 left-0 right-0 z-[600] p-3">
            <MobileSheet
              property={selectedProperty}
              onOpenDetail={setDetailProperty}
              onClose={() => setSelectedProperty(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden shrink-0 flex"
        style={{ backgroundColor: '#2a3330', borderTop: '1px solid rgba(136,152,147,0.2)' }}
      >
        {(['list', 'map'] as MobileTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => { setMobileTab(tab); if (tab === 'list') setSelectedProperty(null); }}
            className="relative flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
            style={{ color: mobileTab === tab ? '#d41f27' : '#889893' }}
          >
            {mobileTab === tab && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                style={{ backgroundColor: '#d41f27' }}
              />
            )}
            {tab === 'list' ? <LayoutList className="w-5 h-5" /> : <MapIcon className="w-5 h-5" />}
            <span className="text-xs font-semibold uppercase tracking-wide">
              {tab === 'list' ? 'Properties' : 'Map'}
            </span>
          </button>
        ))}
      </nav>

      {/* Desktop footer (hidden on mobile) */}
      <footer
        className="hidden md:block shrink-0 px-4 sm:px-6 py-3"
        style={{ backgroundColor: '#2a3330', borderTop: '1px solid rgba(136,152,147,0.15)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <img src={ECRLogo} alt="ECR" className="h-6 w-auto shrink-0" />

          <div className="h-5 w-px shrink-0 hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />

          <span className="text-xs uppercase tracking-widest hidden sm:block" style={{ color: 'rgba(136,152,147,0.4)' }}>Prepared by</span>

          <div className="flex items-center gap-2">
            <BrokerAvatar name="Patrick Ley" photo={PatrickPhoto} />
            <div>
              <p className="text-xs font-semibold leading-tight text-white">Patrick Ley, SIOR CCIM</p>
              <a href="tel:5125050002" className="text-xs transition-colors block" style={{ color: '#889893' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}>512.505.0002</a>
              <a href="mailto:pley@ecrtx.com" className="text-xs transition-colors block" style={{ color: '#889893' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}>pley@ecrtx.com</a>
            </div>
          </div>

          <div className="h-5 w-px shrink-0 hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />

          <div className="flex items-center gap-2">
            <BrokerAvatar name="Ross Chumley" photo={RossPhoto} />
            <div>
              <p className="text-xs font-semibold leading-tight text-white">Ross Chumley</p>
              <a href="tel:5125050029" className="text-xs transition-colors block" style={{ color: '#889893' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}>512.505.0029</a>
              <a href="mailto:rchumley@ecrtx.com" className="text-xs transition-colors block" style={{ color: '#889893' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}>rchumley@ecrtx.com</a>
            </div>
          </div>

          <div className="h-5 w-px shrink-0 hidden lg:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />

          <p className="text-xs hidden lg:block" style={{ color: 'rgba(136,152,147,0.5)' }}>
            ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 //
            <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="transition-colors ml-1" style={{ color: '#889893' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#889893'; }}>ecrtx.com</a>
          </p>

          <div className="flex-1" />

          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#d41f27' }}>Beyond Real Estate.</p>
        </div>
      </footer>

      {notesProperty && (
        <NotesDrawer
          property={notesProperty}
          userEmail={userEmail}
          onClose={() => setNotesProperty(null)}
          onNotesCountChange={handleNotesCountChange}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrokerAvatar
// ---------------------------------------------------------------------------
function BrokerAvatar({ name, photo }: { name: string; photo: string }) {
  const initials = name.split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).slice(0, 2).join('');
  const [err, setErr] = useState(false);
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
      style={{ border: '1.5px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(212,31,39,0.12)' }}>
      {!err
        ? <img src={photo} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <span className="text-xs font-bold" style={{ color: '#d41f27' }}>{initials}</span>
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileSheet — bottom sheet shown on map when a pin is tapped
// ---------------------------------------------------------------------------
interface MobileSheetProps {
  property: Property;
  onOpenDetail: (p: Property) => void;
  onClose: () => void;
}

function MobileSheet({ property, onOpenDetail, onClose }: MobileSheetProps) {
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const mainPhoto = photos[0] ?? property.hero_image_url ?? null;
  const suites = property.suites ?? [];
  const hasAvailable = suites.some(s => s.available === 'Available Now');

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'white', boxShadow: '0 -4px 32px rgba(0,0,0,0.18)', border: '1px solid #e5e1d8' }}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: '#e5e1d8' }}>
          {mainPhoto && <img src={mainPhoto} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#d41f27' }}>
              {property.property_type}
            </span>
            {hasAvailable && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27' }}>
                For Lease
              </span>
            )}
          </div>
          <h3 className="text-sm font-extrabold uppercase leading-tight" style={{ color: '#1e2624' }}>{property.name}</h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#7a8a87' }}>{property.address}</p>
          {property.total_sf && (
            <p className="text-xs mt-1 tabular-nums font-medium" style={{ color: '#3a4a47' }}>
              {property.total_sf.toLocaleString()} SF
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f0ede8', color: '#7a8a87' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <button
          onClick={() => onOpenDetail(property)}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ backgroundColor: '#d41f27' }}
          onTouchStart={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#b81920'; }}
          onTouchEnd={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#d41f27'; }}
        >
          View Details
        </button>
        {property.brochure_url && (
          <a
            href={property.brochure_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: '#879792' }}
          >
            <Download className="w-4 h-4" />
            <span className="hidden xs:inline">Brochure</span>
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickView — right panel when a map pin / list item is selected (desktop)
// ---------------------------------------------------------------------------
interface QuickViewProps {
  property: Property;
  isFavorited: boolean;
  notesCount: number;
  onOpenDetail: (p: Property) => void;
  onFavoriteToggle: (id: string, current: boolean) => void;
  onOpenNotes: (p: Property) => void;
  onClose: () => void;
}

function QuickView({ property, isFavorited, notesCount, onOpenDetail, onFavoriteToggle, onOpenNotes, onClose }: QuickViewProps) {
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const suites = property.suites ?? [];
  const availableCount = suites.length;
  const heroSrc = photos[0] ?? property.hero_image_url ?? null;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <div className="relative h-52 shrink-0" style={{ backgroundColor: '#1e2624' }}>
        {heroSrc && (
          <img
            src={heroSrc}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.9) 0%, transparent 55%)' }} />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: 'white' }}
        >
          ×
        </button>
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: 'rgba(42,51,48,0.8)', color: 'white' }}>{property.property_type}</span>
          {suites.some(s => s.available === 'Available Now') && (
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: '#d41f27', color: 'white' }}>For Lease</span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#d41f27' }}>{property.market}</p>
          <h3 className="text-lg font-extrabold uppercase leading-tight" style={{ color: '#1e2624' }}>{property.name}</h3>
          <p className="text-xs mt-1" style={{ color: '#7a8a87' }}>{property.address}</p>
        </div>

        {property.description && (
          <p className="text-xs leading-relaxed" style={{ color: '#3a4a47', borderTop: '1px solid #e5e1d8', paddingTop: 10 }}>
            {property.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden" style={{ backgroundColor: '#dedad3' }}>
          {[
            { label: 'Size', value: property.total_sf ? `${property.total_sf.toLocaleString()} SF` : '—' },
            { label: 'Available Suites', value: availableCount > 0 ? `${availableCount}` : '—' },
            ...(property.year_built ? [{ label: 'Year Built', value: `${property.year_built}` }] : []),
            ...(property.parking_ratio ? [{ label: 'Parking', value: property.parking_ratio }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="px-3 py-2.5" style={{ backgroundColor: '#f7f5f1' }}>
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#7a8a87' }}>{label}</p>
              <p className="text-xs font-semibold leading-tight" style={{ color: '#1e2624' }}>{value}</p>
            </div>
          ))}
        </div>

        {property.property_notes && (
          <div className="rounded-lg px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: '#f7f5f1', border: '1px solid #dedad3' }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: '#7a8a87' }}>Notes</p>
            <p style={{ color: '#3a4a47' }}>{property.property_notes}</p>
          </div>
        )}

        <button
          onClick={() => onOpenDetail(property)}
          className="w-full py-2.5 rounded-xl text-white text-sm font-bold uppercase tracking-wide transition-colors"
          style={{ backgroundColor: '#d41f27' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b81920'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#d41f27'; }}
        >
          View Full Details
        </button>

        {property.brochure_url ? (
          <a
            href={property.brochure_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#879792', color: 'white' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#6e7f7a'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#879792'; }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Brochure
          </a>
        ) : (
          <div
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold opacity-30 cursor-not-allowed"
            style={{ backgroundColor: '#879792', color: 'white' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Brochure
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onFavoriteToggle(property.id, isFavorited)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={isFavorited
              ? { backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.25)' }
              : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }
            }
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {isFavorited ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={() => onOpenNotes(property)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={notesCount > 0
              ? { backgroundColor: '#f7f5f1', color: '#3a4a47', border: '1px solid #dedad3' }
              : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }
            }
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {notesCount > 0 ? `${notesCount} Note${notesCount !== 1 ? 's' : ''}` : 'Notes'}
          </button>
        </div>

        {suites.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#7a8a87' }}>Available Suites</p>
            <div className="space-y-1.5">
              {suites.slice(0, 4).map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: '#f7f5f1', border: '1px solid #e5e1d8' }}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: '#1e2624' }}>{s.suite_name}</p>
                    <p className="text-xs" style={{ color: '#7a8a87' }}>{s.sf?.toLocaleString() ?? '—'} SF</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold" style={{ color: '#3a4a47' }}>
                      {s.base_rent ? `$${s.base_rent}/SF` : s.op_exp ? `$${s.op_exp} OpEx` : '—'}
                    </p>
                    <span className="text-xs" style={{ color: s.available === 'Available Now' ? '#d41f27' : '#7a8a87' }}>
                      {s.available ?? '—'}
                    </span>
                  </div>
                </div>
              ))}
              {suites.length > 4 && (
                <button onClick={() => onOpenDetail(property)} className="text-xs w-full text-center pt-1" style={{ color: '#d41f27' }}>
                  +{suites.length - 4} more suites
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
