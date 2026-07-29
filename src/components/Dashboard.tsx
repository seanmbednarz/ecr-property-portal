import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Property, Broker, Client, Profile } from '../types';
import Header, { NavTab } from './Header';
import PropertyListSidebar from './PropertyListSidebar';
import MapView from './MapView';
import PropertyDetailPage from './PropertyDetailPage';
import NotesDrawer from './NotesDrawer';
import AddPropertyModal from './AddPropertyModal';
import EditPropertyModal from './EditPropertyModal';
import BrokersPage from './BrokersPage';
import ClientsPage from './ClientsPage';
import { Search, ChevronDown, Check, LayoutList, Map as MapIcon, Pencil, X, Download, Plus } from 'lucide-react';
import ECRLogo from '../assets/ECR_Logo.svg';
import { usePropertyPhotos } from '../hooks/usePropertyPhotos';
import { propertyTypesOf, listingStatusOf, statusColor, suitesForClient, isSaleSuite } from '../lib/propertyMeta';
import { formatAddress } from '../lib/geocode';
import { mapClientBrokers } from '../lib/clientBrokers';

interface DashboardProps {
  userEmail: string;
  profile: Profile | null;
}

type SortKey = 'featured' | 'size_desc' | 'size_asc' | 'rate_desc' | 'rate_asc' | 'lat_desc' | 'lat_asc' | 'lng_desc' | 'lng_asc';
type MobileTab = 'list' | 'map';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'size_desc', label: 'Size · High → Low' },
  { key: 'size_asc', label: 'Size · Low → High' },
  { key: 'rate_desc', label: 'Rate · High → Low' },
  { key: 'rate_asc', label: 'Rate · Low → High' },
  { key: 'lat_desc', label: 'North → South' },
  { key: 'lat_asc', label: 'South → North' },
  { key: 'lng_desc', label: 'East → West' },
  { key: 'lng_asc', label: 'West → East' },
];

export default function Dashboard({ userEmail, profile }: DashboardProps) {
  const userRole = profile?.role ?? 'client';
  const isAdmin = userRole === 'admin';
  const isBroker = userRole === 'broker';
  const isClient = userRole === 'client';
  // Clients are locked to their assigned client_id; admins/brokers can switch
  const lockedClientId = isClient ? (profile?.client_id ?? null) : null;
  const [properties, setProperties] = useState<Property[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
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
  const [desktopView, setDesktopView] = useState<'map' | 'list'>('map');
  const [activeTab, setActiveTab] = useState<NavTab>('properties');
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  // Sync selectedClientId from URL on initial client load (admin/broker only)
  useEffect(() => {
    if (isClient || clients.length === 0) return;
    const param = new URLSearchParams(window.location.search).get('client');
    if (param && clients.some(c => c.id === param)) {
      setSelectedClientId(param);
    }
  }, [clients, isClient]);

  // Keep URL in sync with selected client (admin/broker only)
  useEffect(() => {
    if (isClient) return;
    const url = new URL(window.location.href);
    if (selectedClientId) {
      url.searchParams.set('client', selectedClientId);
    } else {
      url.searchParams.delete('client');
    }
    window.history.replaceState(null, '', url.toString());
  }, [selectedClientId, isClient]);

  // For client role: always locked to their client; for broker: can switch among assigned clients
  function effectiveClientId() {
    if (isClient) return lockedClientId;
    return selectedClientId;
  }

  useEffect(() => {
    if (!showSortMenu) return;
    const handler = () => setShowSortMenu(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showSortMenu]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([fetchProperties(), fetchBrokers(), fetchClients(), fetchFavorites(), fetchNotesCounts()]);
    setLoading(false);
  }

  async function fetchProperties() {
    const { data, error } = await supabase
      .from('properties')
      .select(`*, suites:property_suites(*), brokers:property_brokers(broker:brokers(*)), property_clients(client_id)`);
    if (!error && data) {
      const mapped = (data as any[]).map(p => ({
        ...p,
        suites: (p.suites ?? []).sort((a: any, b: any) => a.display_order - b.display_order),
        brokers: (p.brokers ?? []).map((pb: any) => pb.broker).filter(Boolean).sort((a: any, b: any) => a.display_order - b.display_order),
        client_ids: (p.property_clients ?? []).map((pc: any) => pc.client_id),
      }));
      setProperties(mapped);
    }
  }

  async function fetchBrokers() {
    const { data } = await supabase.from('brokers').select('*').order('display_order');
    if (data) setBrokers(data as Broker[]);
  }

  async function fetchClients() {
    let query = supabase
      .from('clients')
      .select(`*, brokers:client_brokers(is_lead, broker:brokers(*))`)
      .order('created_at');
    // Brokers only see clients assigned to them
    if (isBroker && profile?.broker_id) {
      const { data: cbRows } = await supabase
        .from('client_brokers')
        .select('client_id')
        .eq('broker_id', profile.broker_id);
      const ids = (cbRows ?? []).map((r: any) => r.client_id);
      if (ids.length > 0) query = query.in('id', ids);
      else { setClients([]); return; }
    }
    const { data } = await query;
    if (data) {
      setClients((data as any[]).map(c => mapClientBrokers(c)));
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

  // Footer "Prepared by" brokers are always the selected client's brokers.
  // Nothing shows in the All Clients view or for a client with no brokers.
  const activeClientId = effectiveClientId();
  const selectedClient = clients.find(c => c.id === activeClientId) ?? null;

  // Open the edit modal with the RAW property (all suites), never the
  // client-filtered copy — otherwise saving while "viewing as" a client
  // would silently delete the suites hidden from that client.
  const editRawProperty = (p: Property) => setEditProperty(properties.find(x => x.id === p.id) ?? p);
  const footerBrokers = selectedClient?.brokers ?? [];

  const propertyTypes = ['All', ...Array.from(new Set(properties.flatMap(p => propertyTypesOf(p))))];

  const filtered = useMemo(() => properties
    .filter(p => {
      if (activeClientId && !(p.client_ids ?? []).includes(activeClientId)) return false;
      if (showFavoritesOnly && !favorites.has(p.id)) return false;
      if (typeFilter !== 'All' && !propertyTypesOf(p).includes(typeFilter)) return false;
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
    // Per-client suite visibility: when viewing as a client, hide suites
    // tagged for other clients. Edit always uses the raw property (see
    // editRawProperty) so untagged clients' suites aren't lost on save.
    .map(p => activeClientId ? { ...p, suites: suitesForClient(p.suites ?? [], activeClientId) } : p)
    .sort((a, b) => {
      if (sortKey === 'size_desc') return (b.total_sf ?? 0) - (a.total_sf ?? 0);
      if (sortKey === 'size_asc') return (a.total_sf ?? 0) - (b.total_sf ?? 0);
      if (sortKey === 'rate_desc' || sortKey === 'rate_asc') {
        const rateOf = (p: typeof a) => {
          const rates = (p.suites ?? []).map(s => s.base_rent).filter((r): r is number => r != null);
          return rates.length ? Math.max(...rates) : null;
        };
        const ra = rateOf(a); const rb = rateOf(b);
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1; if (rb == null) return -1;
        return sortKey === 'rate_desc' ? rb - ra : ra - rb;
      }
      if (sortKey === 'lat_desc') return (b.lat ?? -90) - (a.lat ?? -90);
      if (sortKey === 'lat_asc') return (a.lat ?? -90) - (b.lat ?? -90);
      if (sortKey === 'lng_desc') return (b.lng ?? -180) - (a.lng ?? -180);
      if (sortKey === 'lng_asc') return (a.lng ?? -180) - (b.lng ?? -180);
      return 0;
    }), [properties, activeClientId, showFavoritesOnly, favorites, typeFilter, searchQuery, sortKey]);

  if (detailProperty) {
    return (
      <>
        <PropertyDetailPage
          property={detailProperty}
          isFavorited={favorites.has(detailProperty.id)}
          notesCount={notesCounts[detailProperty.id] ?? 0}
          isAdmin={isAdmin}
          client={selectedClient}
          onBack={() => setDetailProperty(null)}
          onFavoriteToggle={handleFavoriteToggle}
          onOpenNotes={(p) => setNotesProperty(p)}
          onBrochureUploaded={(propertyId, url) => {
            setDetailProperty(prev => prev ? { ...prev, brochure_url: url } : prev);
            setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, brochure_url: url } : p));
          }}
          onEdit={editRawProperty}
        />
        {notesProperty && (
          <NotesDrawer
            property={notesProperty}
            userEmail={userEmail}
            onClose={() => setNotesProperty(null)}
            onNotesCountChange={handleNotesCountChange}
          />
        )}
        {editProperty && (
          <EditPropertyModal
            property={editProperty}
            onClose={() => setEditProperty(null)}
            onSaved={updated => {
              setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
              setDetailProperty(prev => prev && prev.id === updated.id ? updated : prev);
              setEditProperty(null);
            }}
            onDeleted={id => {
              setProperties(prev => prev.filter(p => p.id !== id));
              if (detailProperty?.id === id) setDetailProperty(null);
              setEditProperty(null);
            }}
            clients={clients}
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
        userRole={userRole}
        favoritesCount={favorites.size}
        showFavoritesOnly={showFavoritesOnly}
        activeTab={activeTab}
        clients={clients}
        selectedClientId={activeClientId}
        onToggleFavorites={() => setShowFavoritesOnly(v => !v)}
        onTabChange={setActiveTab}
        onClientChange={isClient ? () => {} : setSelectedClientId}
      />

      {/* Brokers tab */}
      {activeTab === 'brokers' && <BrokersPage clients={clients} />}

      {/* Clients tab */}
      {activeTab === 'clients' && (
        <ClientsPage
          brokers={brokers}
          properties={properties.map(p => ({ id: p.id, client_id: p.client_id, client_ids: p.client_ids }))}
          onClientsChange={setClients}
          canManage={isAdmin}
        />
      )}

      {/* Properties tab */}
      {activeTab === 'properties' && (<>
        {/* Sub-bar */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ backgroundColor: '#f0ede8', borderBottom: '1px solid #dedad3' }}>
          {/* Mobile favorites */}
          <button
            onClick={() => setShowFavoritesOnly(v => !v)}
            className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors"
            style={showFavoritesOnly ? { backgroundColor: 'rgba(212,31,39,0.12)', color: '#d41f27' } : { backgroundColor: 'white', color: '#7a8a87', border: '1px solid #dedad3' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#7a8a87' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search properties…"
              className="w-full text-sm rounded-lg pl-8 pr-3 py-1.5 focus:outline-none transition-colors"
              style={{ backgroundColor: 'white', border: '1px solid #dedad3', color: '#1e2624' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(212,31,39,0.5)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#dedad3'; }}
            />
          </div>

          <span className="hidden sm:block text-xs tabular-nums shrink-0" style={{ color: '#9aaba8' }}>
            Showing <span style={{ color: '#3a4a47' }}>{filtered.length}</span> / {properties.length}
          </span>

          {/* Map / List view toggle — desktop only */}
          <div className="hidden md:flex ml-auto rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid #dedad3' }}>
            {([['map', MapIcon, 'Map'], ['list', LayoutList, 'List']] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setDesktopView(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={desktopView === key
                  ? { backgroundColor: '#d41f27', color: 'white' }
                  : { backgroundColor: 'white', color: '#7a8a87' }}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Sort — z 35: above the map and list overlay (30), below the
              sticky header (40) so the Viewing-as dropdown covers it */}
          <div className="relative ml-auto md:ml-0" style={{ zIndex: 35 }} onClick={e => e.stopPropagation()}>
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
              <div className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden min-w-[200px]" style={{ backgroundColor: 'white', border: '1px solid #dedad3', zIndex: 1500 }}>
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors"
                    style={sortKey === opt.key ? { color: '#d41f27', backgroundColor: 'rgba(212,31,39,0.05)' } : { color: '#3a4a47' }}
                    onMouseEnter={e => { if (sortKey !== opt.key) e.currentTarget.style.backgroundColor = '#f7f5f1'; }}
                    onMouseLeave={e => { if (sortKey !== opt.key) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span className="uppercase tracking-wide text-xs">{opt.label}</span>
                    {sortKey === opt.key && <Check className="w-3.5 h-3.5" style={{ color: '#d41f27' }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* + New Property — admin only */}
          {isAdmin && (
          <button
            onClick={() => setShowAddProperty(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: '#d41f27', color: 'white' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b81920')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d41f27')}
          >
            <Plus className="w-3.5 h-3.5" /> New Property
          </button>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 relative">
          {desktopView === 'map' && (
          <div className="w-72 shrink-0 hidden md:flex flex-col h-full">
            {loading ? loadingSpinner : (
              <PropertyListSidebar
                properties={filtered}
                selectedId={selectedProperty?.id ?? null}
                favorites={favorites}
                notesCounts={notesCounts}
                typeFilter={typeFilter}
                propertyTypes={propertyTypes}
                isAdmin={isAdmin}
                onSelect={p => setSelectedProperty(prev => prev?.id === p.id ? null : p)}
                onOpenDetail={setDetailProperty}
                onTypeFilter={handleTypeFilter}
                onFavoriteToggle={handleFavoriteToggle}
                onEdit={editRawProperty}
              />
            )}
          </div>
          )}

          <div className={`md:hidden flex-col h-full overflow-hidden ${mobileTab === 'list' ? 'flex flex-1' : 'hidden'}`}>
            {loading ? loadingSpinner : (
              <PropertyListSidebar
                properties={filtered}
                selectedId={null}
                favorites={favorites}
                notesCounts={notesCounts}
                typeFilter={typeFilter}
                propertyTypes={propertyTypes}
                isAdmin={isAdmin}
                onSelect={setDetailProperty}
                onOpenDetail={setDetailProperty}
                onTypeFilter={handleTypeFilter}
                onFavoriteToggle={handleFavoriteToggle}
                onEdit={editRawProperty}
              />
            )}
          </div>

          <div className={`flex-1 relative min-w-0 ${mobileTab === 'list' ? 'hidden md:block' : 'block'}`}>
            {/* Map stays mounted (just invisible) under the list overlay so
                toggling back is instant; invisibility also keeps its z-[500]
                badges from bleeding through the list. Mobile is unaffected. */}
            <div className={`h-full ${desktopView === 'list' ? 'md:invisible' : ''}`}>
              <MapView
                properties={filtered}
                selectedId={selectedProperty?.id ?? null}
                onSelect={p => setSelectedProperty(prev => prev?.id === p.id ? null : p)}
                officeLocation={
                  selectedClient?.office_lat != null && selectedClient?.office_lng != null
                    ? { lat: selectedClient.office_lat, lng: selectedClient.office_lng, address: selectedClient.office_address ?? '' }
                    : null
                }
              />
            </div>
            {/* List view — overlays the map (desktop only) so toggling back is
                instant. z-30 keeps it under the sticky header (z-40) so the
                "Viewing as" dropdown isn't hidden behind it. */}
            {desktopView === 'list' && (
              <div className="absolute inset-0 z-30 hidden md:block overflow-y-auto" style={{ backgroundColor: '#f0ede8' }}>
                <div className="p-4 flex flex-col gap-4 max-w-6xl mx-auto">
                  {filtered.map(p => (
                    <ListViewRow
                      key={p.id}
                      property={p}
                      selected={selectedProperty?.id === p.id}
                      onSelect={() => setSelectedProperty(prev => prev?.id === p.id ? null : p)}
                      onOpenDetail={() => setDetailProperty(p)}
                      onEdit={isAdmin ? () => editRawProperty(p) : undefined}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-sm text-center py-16" style={{ color: '#9aaba8' }}>No properties match the current filters.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedProperty && (
            <div className="w-[420px] shrink-0 hidden lg:flex flex-col overflow-y-auto" style={{ backgroundColor: 'white', borderLeft: '1px solid #dedad3' }}>
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

          {selectedProperty && mobileTab === 'map' && (
            <div className="md:hidden absolute bottom-0 left-0 right-0 z-[600] p-3">
              <MobileSheet property={selectedProperty} onOpenDetail={setDetailProperty} onClose={() => setSelectedProperty(null)} />
            </div>
          )}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden shrink-0 flex" style={{ backgroundColor: '#2a3330', borderTop: '1px solid rgba(136,152,147,0.2)' }}>
          {(['list', 'map'] as MobileTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setMobileTab(tab); if (tab === 'list') setSelectedProperty(null); }}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
              style={{ color: mobileTab === tab ? '#d41f27' : '#889893' }}
            >
              {mobileTab === tab && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ backgroundColor: '#d41f27' }} />}
              {tab === 'list' ? <LayoutList className="w-5 h-5" /> : <MapIcon className="w-5 h-5" />}
              <span className="text-xs font-semibold uppercase tracking-wide">{tab === 'list' ? 'Properties' : 'Map'}</span>
            </button>
          ))}
        </nav>

        {notesProperty && (
          <NotesDrawer
            property={notesProperty}
            userEmail={userEmail}
            onClose={() => setNotesProperty(null)}
            onNotesCountChange={handleNotesCountChange}
          />
        )}
        {showAddProperty && (
          <AddPropertyModal
            onClose={() => setShowAddProperty(false)}
            onSaved={newProp => { setProperties(prev => [newProp, ...prev]); setShowAddProperty(false); }}
            clients={clients}
            defaultClientId={activeClientId}
          />
        )}
        {editProperty && (
          <EditPropertyModal
            property={editProperty}
            onClose={() => setEditProperty(null)}
            onSaved={updated => {
              setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
              if (detailProperty?.id === updated.id) setDetailProperty(updated);
              setEditProperty(null);
            }}
            onDeleted={id => {
              setProperties(prev => prev.filter(p => p.id !== id));
              if (detailProperty?.id === id) setDetailProperty(null);
              setEditProperty(null);
            }}
            clients={clients}
          />
        )}
      </>)}

      {/* Footer — shown on all tabs */}
      <footer className="hidden md:flex shrink-0 flex-wrap items-center gap-4 px-4 sm:px-6 py-3" style={{ backgroundColor: '#2a3330', borderTop: '1px solid rgba(136,152,147,0.15)' }}>
        <img src={ECRLogo} alt="ECR" className="h-6 w-auto shrink-0" />
        {footerBrokers.length > 0 && (
          <>
            <div className="h-5 w-px shrink-0 hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.2)' }} />
            <span className="text-xs uppercase tracking-widest hidden sm:block" style={{ color: '#b5c5c1' }}>Prepared by</span>
            {footerBrokers.map((broker, i) => (
              <div key={broker.id} className="flex items-center gap-2">
                {i > 0 && <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />}
                <BrokerAvatar name={broker.name} photoUrl={broker.photo_url} />
                <div>
                  <p className="text-xs font-semibold leading-tight text-white">{broker.name}</p>
                  {broker.phone && (
                    <a href={`tel:${broker.phone.replace(/\D/g, '')}`} className="text-xs transition-colors block" style={{ color: '#889893' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>{broker.phone}</a>
                  )}
                  {broker.email && (
                    <a href={`mailto:${broker.email}`} className="text-xs transition-colors block" style={{ color: '#889893' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>{broker.email}</a>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
        <div className="h-5 w-px shrink-0 hidden lg:block" style={{ backgroundColor: 'rgba(136,152,147,0.15)' }} />
        <p className="text-xs hidden lg:block" style={{ color: '#b5c5c1' }}>
          ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 //
          <a href="https://ecrtx.com" target="_blank" rel="noopener noreferrer" className="transition-colors ml-1" style={{ color: '#889893' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#889893'; }}>ecrtx.com</a>
        </p>
        <div className="flex-1" />
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#d41f27' }}>Beyond Real Estate.</p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrokerAvatar
// ---------------------------------------------------------------------------
function BrokerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name.split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).slice(0, 2).join('');
  const [err, setErr] = useState(false);
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
      style={{ border: '1.5px solid rgba(255,255,255,0.6)', backgroundColor: 'rgba(212,31,39,0.12)' }}>
      {photoUrl && !err
        ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <span className="text-xs font-bold" style={{ color: '#d41f27' }}>{initials}</span>
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileSheet
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
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'white', boxShadow: '0 -4px 32px rgba(0,0,0,0.18)', border: '1px solid #e5e1d8' }}>
      <div className="flex items-start gap-3 p-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: '#e5e1d8' }}>
          {mainPhoto && <img src={mainPhoto} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#d41f27' }}>{propertyTypesOf(property).join(' / ')}</span>
            {listingStatusOf(property).map(s => (
              <span key={s} className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: statusColor(s), color: 'white' }}>{s}</span>
            ))}
          </div>
          <h3 className="text-sm font-extrabold uppercase leading-tight" style={{ color: '#1e2624' }}>{property.name}</h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#7a8a87' }}>{formatAddress(property.address)}</p>
          {property.total_sf && <p className="text-xs mt-1 tabular-nums font-medium" style={{ color: '#3a4a47' }}>{property.total_sf.toLocaleString()} SF</p>}
        </div>
        <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0ede8', color: '#7a8a87' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <button onClick={() => onOpenDetail(property)} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#d41f27' }}>View Details</button>
        {property.brochure_url && (
          <a href={property.brochure_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#879792' }}>
            <Download className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListViewRow — availability-report style row for the desktop List view:
// full-height photo on the left, property header + suites table on the right
// ---------------------------------------------------------------------------
interface ListViewRowProps {
  property: Property;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  onEdit?: () => void;
}

function ListViewRow({ property, selected, onSelect, onOpenDetail, onEdit }: ListViewRowProps) {
  const { photos } = usePropertyPhotos(property.id, property.slug);
  const photoSrc = photos[0] ?? property.hero_image_url ?? null;
  const suites = property.suites ?? [];
  const rate = (r: number | null) => (r != null ? `$${Number(r).toFixed(2)}/SF` : 'Contact Broker');
  // Sale suites quote price per SF, so the shared column drops the "Rental"
  // qualifier as soon as one is present.
  const anySale = suites.some(isSaleSuite);

  const colHeader = "text-xs pb-1 pr-6" ;
  const colHeaderStyle = { color: '#7a8a87', borderBottom: '1px solid #dedad3' };
  const cell = "text-sm font-semibold py-1.5 pr-6";

  return (
    <div
      className="flex rounded-xl overflow-hidden cursor-pointer transition-all duration-200"
      style={{
        backgroundColor: 'white',
        border: selected ? '2px solid #d41f27' : '1px solid #dedad3',
        boxShadow: selected ? '0 8px 24px rgba(212,31,39,0.15)' : '0 2px 8px rgba(0,0,0,0.04)',
      }}
      onClick={onSelect}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
    >
      {/* Photo — fills the full height of the row */}
      <div className="w-52 lg:w-64 shrink-0 relative" style={{ backgroundColor: '#e5e1d8' }}>
        {photoSrc && <img src={photoSrc} alt={property.name} className="absolute inset-0 w-full h-full object-cover" />}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header band */}
        <div className="flex items-start justify-between gap-3 px-5 py-3.5" style={{ backgroundColor: '#f5f2ec', borderBottom: '1px solid #e5e1d8' }}>
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold leading-tight truncate" style={{ color: '#1e2624' }}>{property.name}</h3>
            <p className="text-xs font-bold uppercase tracking-wider mt-0.5" style={{ color: '#3a4a47' }}>{formatAddress(property.address)}</p>
            <p className="text-xs mt-1.5 flex flex-wrap gap-x-4" style={{ color: '#7a8a87' }}>
              {property.total_sf != null && <span>Size: <span className="font-bold tabular-nums" style={{ color: '#3a4a47' }}>{property.total_sf.toLocaleString()} SF</span></span>}
              {property.market && <span>Submarket: <span className="font-bold uppercase" style={{ color: '#3a4a47' }}>{property.market}</span></span>}
              <span>Type: <span className="font-bold uppercase" style={{ color: '#3a4a47' }}>{propertyTypesOf(property).join('/')}</span></span>
              {listingStatusOf(property).length > 0 && (
                <span>Status: <span className="font-bold uppercase" style={{ color: '#d41f27' }}>{listingStatusOf(property).join(' / ')}</span></span>
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onOpenDetail(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors whitespace-nowrap"
              style={{ backgroundColor: '#d41f27' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b81920')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d41f27')}
            >
              View Details
            </button>
            {onEdit && (
              <button
                onClick={e => { e.stopPropagation(); onEdit(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0ede8')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Availability table — only real suite availability; a property with
            no suites gets no phantom "full building" row (size lives in the
            header band summary line) */}
        <div className="px-5 py-3 flex-1">
          {suites.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className={`${colHeader} font-normal w-[40%]`} style={colHeaderStyle}>Availability</th>
                  <th className={`${colHeader} font-normal w-[18%]`} style={colHeaderStyle}>Size</th>
                  <th className={`${colHeader} font-normal w-[22%]`} style={colHeaderStyle}>{anySale ? 'Rate' : 'Rental Rate'}</th>
                  <th className={`${colHeader} font-normal w-[20%]`} style={colHeaderStyle}>Date Available</th>
                </tr>
              </thead>
              <tbody style={{ color: '#1e2624' }}>
                {suites.map(s => (
                  <tr key={s.id}>
                    <td className={cell}>
                      {s.suite_name}
                      {isSaleSuite(s) && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold align-middle"
                          style={{ backgroundColor: 'rgba(46,125,79,0.1)', color: '#2e7d4f' }}>For Sale</span>
                      )}
                    </td>
                    <td className={`${cell} tabular-nums`}>{s.sf != null ? `${s.sf.toLocaleString()} SF` : '—'}</td>
                    <td className={cell}>{rate(s.base_rent)}</td>
                    <td className={cell} style={{ color: s.available === 'Available Now' ? '#d41f27' : '#3a4a47' }}>{s.available ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs" style={{ color: '#9aaba8' }}>Contact broker for availability.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickView
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
  const heroSrc = photos[0] ?? property.hero_image_url ?? null;

  return (
    <div className="flex flex-col">
      <div className="relative h-52 shrink-0" style={{ backgroundColor: '#1e2624' }}>
        {heroSrc && <img src={heroSrc} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.9) 0%, transparent 55%)' }} />
        <button onClick={onClose} className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: 'white' }}>×</button>
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {propertyTypesOf(property).map(t => (
            <span key={t} className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: 'rgba(42,51,48,0.8)', color: 'white' }}>{t}</span>
          ))}
          {listingStatusOf(property).map(s => (
            <span key={s} className="px-2 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: statusColor(s), color: 'white' }}>{s}</span>
          ))}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#d41f27' }}>{property.market}</p>
          <h3 className="text-lg font-extrabold uppercase leading-tight" style={{ color: '#1e2624' }}>{property.name}</h3>
          <p className="text-xs mt-1" style={{ color: '#7a8a87' }}>{formatAddress(property.address)}</p>
        </div>

        {property.description && <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: '#3a4a47', borderTop: '1px solid #e5e1d8', paddingTop: 10 }}>{property.description}</p>}

        {property.broker_notes && property.broker_notes.length > 0 && (
          <div style={{ borderTop: '1px solid #e5e1d8', paddingTop: 10 }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#7a8a87' }}>Property Notes</p>
            <ul className="space-y-1.5">
              {property.broker_notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: '#3a4a47' }}>
                  <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#d41f27' }} />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden" style={{ backgroundColor: '#dedad3' }}>
          {[
            { label: 'Size', value: property.total_sf ? `${property.total_sf.toLocaleString()} SF` : '—' },
            { label: 'Suites', value: suites.length > 0 ? `${suites.length}` : '—' },
            ...(property.year_built ? [{ label: 'Year Built', value: `${property.year_built}` }] : []),
            ...(property.parking_ratio ? [{ label: 'Parking', value: property.parking_ratio }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="px-3 py-2.5" style={{ backgroundColor: '#f7f5f1' }}>
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#7a8a87' }}>{label}</p>
              <p className="text-xs font-semibold leading-tight" style={{ color: '#1e2624' }}>{value}</p>
            </div>
          ))}
        </div>

        <button onClick={() => onOpenDetail(property)} className="w-full py-2.5 rounded-xl text-white text-sm font-bold uppercase tracking-wide transition-colors" style={{ backgroundColor: '#d41f27' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#b81920'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#d41f27'; }}>
          View Full Details
        </button>

        {property.brochure_url ? (
          <a href={property.brochure_url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#879792' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#6e7f7a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#879792'; }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Brochure
          </a>
        ) : (
          <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold opacity-30 cursor-not-allowed" style={{ backgroundColor: '#879792', color: 'white' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Brochure
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => onFavoriteToggle(property.id, isFavorited)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={isFavorited ? { backgroundColor: 'rgba(212,31,39,0.08)', color: '#d41f27', border: '1px solid rgba(212,31,39,0.25)' } : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {isFavorited ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => onOpenNotes(property)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={notesCount > 0 ? { backgroundColor: '#f7f5f1', color: '#3a4a47', border: '1px solid #dedad3' } : { color: '#7a8a87', border: '1px solid #dedad3', backgroundColor: 'white' }}>
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
                    <p className="text-xs font-semibold" style={{ color: '#3a4a47' }}>{s.base_rent ? `$${s.base_rent}/SF` : s.op_exp ? `$${s.op_exp} OpEx` : '—'}</p>
                    <span className="text-xs" style={{ color: s.available === 'Available Now' ? '#d41f27' : '#7a8a87' }}>{s.available ?? '—'}</span>
                  </div>
                </div>
              ))}
              {suites.length > 4 && <button onClick={() => onOpenDetail(property)} className="text-xs w-full text-center pt-1" style={{ color: '#d41f27' }}>+{suites.length - 4} more suites</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
