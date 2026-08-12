import { useState, useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Plus, X, GripVertical, Printer, MapPin, Clock, AlertTriangle, Check, Loader2, Calendar, FileDown } from 'lucide-react';
import { Property, Client } from '../types';
import { supabase } from '../lib/supabase';
import { formatAddress } from '../lib/geocode';
import ECRLogoBlock from '../assets/ecr-logo-block.png';

// Survey & tour builder: pick the properties to visit, put them in order, give
// each a time, and see the walking route. The stop list comes first and the map
// second — the itinerary is the thing you read, the map is the reference.

const CARTO_VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const AUSTIN_CENTER: [number, number] = [-97.743057, 30.267153];

export interface TourStop {
  propertyId: string;
  time: string; // 'HH:MM' 24h, kept sortable; rendered as 12h
  // Suites to carry into the tour package. Undefined means "all of them",
  // which is how every tour saved before this existed — so those keep working
  // unchanged. An explicit [] means the broker deselected everything.
  suiteIds?: string[];
}

// The suites a stop should show: the explicit selection, or all of them.
export function suitesForStop(property: Property, stop: TourStop) {
  const all = property.suites ?? [];
  if (!stop.suiteIds) return all;
  return all.filter(su => stop.suiteIds!.includes(su.id));
}

const DAY_START = '09:00';
const DAY_END = '17:00';

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!isFinite(h) || !isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (isFinite(h) ? h : 9) * 60 + (isFinite(m) ? m : 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// Default the next stop to 30 minutes after the last one — a starting point the
// broker then nudges to the real time (tours rarely land on the half hour).
function nextSlotAfter(stops: TourStop[]): string {
  if (stops.length === 0) return DAY_START;
  const next = toMinutes(stops[stops.length - 1].time) + 30;
  return fromMinutes(Math.min(next, toMinutes(DAY_END)));
}

// A tour is usually planned for an upcoming day; default to tomorrow.
function defaultTourDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatTourDate(iso: string | null): string {
  if (!iso) return '';
  // Parse as local, not UTC — 'new Date("2026-08-12")' is midnight UTC and can
  // render as the previous day west of Greenwich.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

interface TourMapPageProps {
  properties: Property[];   // already filtered to the active client
  clientId: string | null;
  clientName: string;
  client: Client | null;    // logo + broker team for the package cover
  canEdit: boolean;         // admins and brokers build the itinerary; clients read it
}

export default function TourMapPage({ properties, clientId, clientName, client, canEdit }: TourMapPageProps) {
  const [packageState, setPackageState] = useState<'idle' | 'building'>('idle');
  const [packageNote, setPackageNote] = useState<string | null>(null);
  const [stops, setStops] = useState<TourStop[]>([]);
  const [tourDate, setTourDate] = useState<string>(defaultTourDate());
  const [showAdd, setShowAdd] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [openSuites, setOpenSuites] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  // Guards the save effect from firing on the initial load of an existing tour.
  const loadedFor = useRef<string | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const addRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<string, Property>();
    properties.forEach(p => m.set(p.id, p));
    return m;
  }, [properties]);

  // Resolved stops, dropping any whose property is no longer visible to this
  // client (reassignment, deletion) so the list can't show phantom rows.
  const resolved = useMemo(
    () => stops.map(s => ({ stop: s, property: byId.get(s.propertyId) })).filter(r => r.property),
    [stops, byId],
  );

  const mappable = useMemo(
    () => resolved.filter(r => r.property!.lat != null && r.property!.lng != null),
    [resolved],
  );
  const missingCoords = resolved.length - mappable.length;

  const available = useMemo(
    () => properties
      .filter(p => !stops.some(s => s.propertyId === p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [properties, stops],
  );

  // Load this client's saved itinerary. Stored server-side so a tour built at
  // a desk is there on a phone during the tour itself.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setSaveError(null);
      if (!clientId) {
        // A tour belongs to a client; there's nothing to load in "All Clients".
        if (!cancelled) { setStops([]); setLoading(false); loadedFor.current = null; }
        return;
      }
      const { data, error } = await supabase
        .from('client_tours')
        .select('stops, tour_date')
        .eq('client_id', clientId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setSaveError("Couldn't load the saved itinerary.");
        setStops([]);
      } else {
        setStops(Array.isArray(data?.stops) ? (data!.stops as TourStop[]) : []);
        setTourDate(data?.tour_date ?? defaultTourDate());
      }
      loadedFor.current = clientId;
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [clientId]);

  // Persist changes. Debounced so dragging a row doesn't fire a write per frame.
  useEffect(() => {
    if (!clientId || !canEdit) return;
    if (loadedFor.current !== clientId) return; // don't save the load itself
    setSaveState('saving');
    const handle = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('client_tours')
        .upsert(
          { client_id: clientId, stops, tour_date: tourDate || null, updated_by: user?.id ?? null },
          { onConflict: 'client_id' },
        );
      if (error) {
        setSaveState('error');
        setSaveError(`Couldn't save: ${error.message}`);
      } else {
        setSaveState('saved');
        setSaveError(null);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [stops, tourDate, clientId, canEdit]);

  useEffect(() => {
    if (!showAdd) return;
    function onDown(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setShowAdd(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showAdd]);

  // ── Map ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: CARTO_VOYAGER,
      center: AUSTIN_CENTER,
      zoom: 12,
      attributionControl: false,
      // Needed so the canvas can be captured for the printable itinerary.
      preserveDrawingBuffer: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on('load', () => {
      map.addSource('tour-route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'tour-route-line',
        type: 'line',
        source: 'tour-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#d41f27',
          'line-width': 3,
          'line-opacity': 0.85,
          // Dashed to read as a walking route rather than a driving leg.
          'line-dasharray': [1.5, 1.5],
        },
      });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Redraw pins + route whenever the itinerary changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const coords: [number, number][] = [];

      mappable.forEach((r, i) => {
        const p = r.property!;
        const lngLat: [number, number] = [p.lng as number, p.lat as number];
        coords.push(lngLat);

        const el = document.createElement('div');
        el.style.cssText = 'cursor:pointer;z-index:10';

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform-origin:bottom center;transition:transform .2s ease';

        const dot = document.createElement('div');
        dot.style.cssText = [
          'width:30px', 'height:30px', 'border-radius:50%',
          'background:#2a3330', 'border:2px solid white',
          'display:flex', 'align-items:center', 'justify-content:center',
          'color:white', 'font-size:12px', 'font-weight:700',
          'font-family:system-ui,sans-serif', 'box-shadow:0 2px 8px rgba(0,0,0,.35)',
        ].join(';');
        dot.textContent = String(i + 1);

        const tail = document.createElement('div');
        tail.style.cssText = 'width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid white;margin-top:-2px';

        wrap.appendChild(dot);
        wrap.appendChild(tail);
        el.appendChild(wrap);

        const popup = new maplibregl.Popup({ offset: 28, closeButton: false, closeOnClick: false })
          .setHTML(
            `<div style="font-family:Montserrat,system-ui,sans-serif;padding:2px 4px;min-width:150px">
               <div style="font-weight:700;font-size:13px;color:#1e2624">${escapeHtml(p.name)}</div>
               <div style="font-size:11px;color:#7a8a87;margin-top:2px">${escapeHtml(formatAddress(p.address))}</div>
               <div style="font-size:11px;color:#d41f27;font-weight:700;margin-top:4px">Stop ${i + 1} · ${formatTime(r.stop.time)}</div>
             </div>`,
          );

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(lngLat)
          .addTo(map);

        el.addEventListener('mouseenter', () => {
          wrap.style.transform = 'scale(1.2)';
          dot.style.background = '#d41f27';
          popup.setLngLat(lngLat).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          wrap.style.transform = 'scale(1)';
          dot.style.background = '#2a3330';
          popup.remove();
        });

        markersRef.current.push(marker);
      });

      const src = map.getSource('tour-route') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
      }

      if (coords.length === 1) {
        map.easeTo({ center: coords[0], zoom: 15 });
      } else if (coords.length > 1) {
        const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(b, { padding: 70, maxZoom: 16, duration: 600 });
      }
    };

    if (map.isStyleLoaded() && map.getSource('tour-route')) draw();
    else map.once('idle', draw);
  }, [mappable]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  function addStop(propertyId: string) {
    setStops(prev => [...prev, { propertyId, time: nextSlotAfter(prev) }]);
    setShowAdd(false);
  }
  function toggleSuite(propertyId: string, suiteId: string, allIds: string[]) {
    setStops(prev => prev.map(st => {
      if (st.propertyId !== propertyId) return st;
      // First edit on a stop that never had a selection starts from "all".
      const current = st.suiteIds ?? allIds;
      const next = current.includes(suiteId)
        ? current.filter(id => id !== suiteId)
        : [...current, suiteId];
      return { ...st, suiteIds: next };
    }));
  }

  function setAllSuites(propertyId: string, allIds: string[], on: boolean) {
    setStops(prev => prev.map(st => (
      st.propertyId === propertyId ? { ...st, suiteIds: on ? allIds : [] } : st
    )));
  }

  function removeStop(propertyId: string) {
    setStops(prev => prev.filter(s => s.propertyId !== propertyId));
  }
  function setTime(propertyId: string, time: string) {
    setStops(prev => prev.map(s => (s.propertyId === propertyId ? { ...s, time } : s)));
  }
  function move(from: number, to: number) {
    if (from === to) return;
    setStops(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }
  function clearAll() {
    setStops([]);
  }

  // The live map's pins are HTML markers layered OVER the WebGL canvas, so a
  // plain getCanvas().toDataURL() captures the basemap and route but no pins.
  // Re-project each stop to screen space and draw the numbered pins onto a copy
  // of the canvas, after fitting the view to the whole tour.
  async function captureMapWithPins(): Promise<string> {
    const map = mapRef.current;
    if (!map) return '';

    if (mappable.length > 0) {
      const coords = mappable.map(r => [r.property!.lng as number, r.property!.lat as number] as [number, number]);
      const bounds = coords.reduce(
        (acc, c) => acc.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 90, maxZoom: 15.5, duration: 0 });
      // Wait for tiles/labels to settle, but never hang the export on it.
      await Promise.race([
        new Promise<void>(resolve => map.once('idle', () => resolve())),
        new Promise<void>(resolve => setTimeout(resolve, 4000)),
      ]);
    }

    const src = map.getCanvas();
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) return src.toDataURL('image/png');
    ctx.drawImage(src, 0, 0);

    // canvas.width is CSS pixels × devicePixelRatio; map.project() returns CSS
    // pixels, so scale to match or the pins land in the wrong place on retina.
    const dpr = src.clientWidth ? src.width / src.clientWidth : 1;

    mappable.forEach((r, i) => {
      const pt = map.project([r.property!.lng as number, r.property!.lat as number]);
      const x = pt.x * dpr;
      const y = pt.y * dpr;
      const radius = 15 * dpr;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#2a3330';
      ctx.fill();
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${14 * dpr}px Montserrat, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y);
    });

    return out.toDataURL('image/png');
  }

  async function handleTourPackage() {
    setPackageState('building');
    setPackageNote(null);
    try {
      let mapImage = '';
      try {
        mapImage = await captureMapWithPins();
      } catch {
        mapImage = '';
      }
      const { buildTourPackage } = await import('../lib/tourPackage');
      const result = await buildTourPackage({
        clientName,
        clientLogoUrl: client?.logo_url ?? null,
        ecrLogoUrl: ECRLogoBlock,
        tourDate,
        tourDateLabel: formatTourDate(tourDate),
        stops: resolved.map(r => ({
          property: r.property!,
          time: r.stop.time,
          suites: suitesForStop(r.property!, r.stop),
        })),
        brokers: client?.brokers ?? [],
        mapImageDataUrl: mapImage,
        formatTime,
      });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);

      // Say plainly which flyers didn't make it — better the broker finds out
      // here than the client finds out mid-tour.
      const notes: string[] = [`${result.flyersIncluded.length} flyer${result.flyersIncluded.length === 1 ? '' : 's'} included`];
      if (result.flyersMissing.length) notes.push(`no flyer on file for ${result.flyersMissing.join(', ')}`);
      if (result.flyersFailed.length) notes.push(`couldn't merge the flyer for ${result.flyersFailed.join(', ')}`);
      setPackageNote(notes.join(' · '));
    } catch (e: any) {
      setPackageNote(`Couldn't build the package: ${e?.message ?? 'unknown error'}`);
    } finally {
      setPackageState('idle');
    }
  }

  function handlePrint() {
    // Snapshot the live map so the printed itinerary carries the route with it.
    let mapImage = '';
    try {
      mapImage = mapRef.current?.getCanvas().toDataURL('image/png') ?? '';
    } catch {
      mapImage = '';
    }
    renderPrintView(clientName, tourDate, resolved.map(r => ({ property: r.property!, time: r.stop.time })), mapImage);
    window.print();
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8" style={{ backgroundColor: '#f0ede8' }}>
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-wide" style={{ color: '#1e2624' }}>Survey &amp; Tour Map</h1>
            <p className="text-sm mt-0.5" style={{ color: '#7a8a87' }}>
              {clientName ? `${clientName} — ` : ''}
              {canEdit
                ? 'Build the tour itinerary, set times, and see the walking route.'
                : 'Your tour itinerary and walking route.'}
            </p>
            {packageNote && (
              <p className="text-xs mt-1.5 px-2 py-1 rounded inline-block"
                style={{ color: '#3a4a47', backgroundColor: '#f5f2ec', border: '1px solid #e5e1d8' }}>
                {packageNote}
              </p>
            )}
            {canEdit && clientId && saveState !== 'idle' && (
              <p className="text-xs mt-1 flex items-center gap-1.5"
                style={{ color: saveState === 'error' ? '#d41f27' : '#9aaba8' }}>
                {saveState === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
                {saveState === 'saved' && <><Check className="w-3 h-3" /> Saved — this itinerary is available on any device</>}
                {saveState === 'error' && <><AlertTriangle className="w-3 h-3" /> {saveError ?? 'Save failed'}</>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {resolved.length > 0 && (
              <>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide"
                  style={{ color: '#3a4a47', border: '1px solid #dedad3', backgroundColor: 'white' }}
                >
                  <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Schedule</span> PDF
                </button>
                <button
                  onClick={handleTourPackage}
                  disabled={packageState === 'building'}
                  title="Cover page, schedule, map, and every flyer in tour order — one PDF"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60"
                  style={{ backgroundColor: '#2a3330' }}
                >
                  {packageState === 'building'
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building…</>
                    : <><FileDown className="w-3.5 h-3.5" /> Tour Package</>}
                </button>
              </>
            )}
            {canEdit && clientId && (
            <div className="relative" ref={addRef}>
              <button
                onClick={() => setShowAdd(v => !v)}
                disabled={available.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
                style={{ backgroundColor: '#d41f27' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add stop
              </button>
              {showAdd && (
                <div className="absolute right-0 top-full mt-1 rounded-xl shadow-xl overflow-hidden w-[300px] max-h-[60vh] overflow-y-auto"
                  style={{ backgroundColor: 'white', border: '1px solid #dedad3', zIndex: 1500 }}>
                  {available.length === 0 ? (
                    <p className="px-4 py-3 text-sm" style={{ color: '#7a8a87' }}>Every available property is already on the tour.</p>
                  ) : available.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addStop(p.id)}
                      className="w-full text-left px-4 py-2.5 transition-colors"
                      style={{ color: '#3a4a47' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f7f5f1')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span className="block text-sm font-semibold truncate" style={{ color: '#1e2624' }}>{p.name}</span>
                      <span className="block text-xs truncate" style={{ color: '#9aaba8' }}>{formatAddress(p.address)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Itinerary first — the map is the reference, this is the document. */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#dedad3', borderTopColor: '#d41f27' }} />
          </div>
        ) : !clientId ? (
          <div className="rounded-2xl px-6 py-14 text-center" style={{ backgroundColor: 'white', border: '1px dashed #dedad3' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#f0ede8' }}>
              <MapPin className="w-5 h-5" style={{ color: '#7a8a87' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: '#3a4a47' }}>Choose a client first</p>
            <p className="text-xs mt-1" style={{ color: '#9aaba8' }}>
              A tour is built from one client's properties — pick one from “Viewing as” above.
            </p>
          </div>
        ) : resolved.length === 0 ? (
          <div className="rounded-2xl px-6 py-14 text-center" style={{ backgroundColor: 'white', border: '1px dashed #dedad3' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#f0ede8' }}>
              <MapPin className="w-5 h-5" style={{ color: '#7a8a87' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: '#3a4a47' }}>No stops yet</p>
            <p className="text-xs mt-1" style={{ color: '#9aaba8' }}>
              {properties.length === 0
                ? 'No properties are assigned to this client yet.'
                : canEdit
                  ? 'Use “Add stop” to build the itinerary.'
                  : 'Your broker hasn’t added any stops yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7a8a87' }}>
                  Itinerary · {resolved.length} {resolved.length === 1 ? 'stop' : 'stops'}
                </p>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" style={{ color: '#9aaba8' }} />
                  {canEdit ? (
                    <input
                      type="date"
                      value={tourDate}
                      onChange={e => setTourDate(e.target.value)}
                      aria-label="Tour date"
                      className="rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                      style={{ backgroundColor: 'white', border: '1px solid #e5e1d8', color: '#3a4a47' }}
                    />
                  ) : (
                    <span className="text-xs font-semibold" style={{ color: '#3a4a47' }}>{formatTourDate(tourDate)}</span>
                  )}
                </div>
              </div>
              {canEdit && <button onClick={clearAll} className="text-xs font-semibold" style={{ color: '#9aaba8' }}>Clear all</button>}
            </div>

            <div className="rounded-2xl overflow-hidden mb-3" style={{ backgroundColor: 'white', border: '1px solid #e5e1d8' }}>
              {resolved.map((r, i) => {
                const p = r.property!;
                const noCoords = p.lat == null || p.lng == null;
                const allSuites = p.suites ?? [];
                const allSuiteIds = allSuites.map(su => su.id);
                const chosen = suitesForStop(p, r.stop);
                const allChosen = chosen.length === allSuites.length;
                const expanded = openSuites === p.id;
                return (
                  <div
                    key={p.id}
                    draggable={canEdit}
                    onDragStart={() => canEdit && setDragIndex(i)}
                    onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                    onDragOver={e => { if (canEdit) { e.preventDefault(); setOverIndex(i); } }}
                    onDrop={e => { if (!canEdit) return; e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid #f0ede8',
                      backgroundColor: overIndex === i && dragIndex !== null && dragIndex !== i ? '#f7f5f1' : 'white',
                      opacity: dragIndex === i ? 0.4 : 1,
                      cursor: canEdit ? 'grab' : 'default',
                    }}
                  >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {canEdit && <GripVertical className="w-4 h-4 shrink-0" style={{ color: '#c8c3b8' }} />}
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: '#2a3330' }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: '#1e2624' }}>{p.name}</p>
                      <p className="text-xs truncate" style={{ color: '#9aaba8' }}>{formatAddress(p.address)}</p>
                      {allSuites.length > 0 && (
                        canEdit ? (
                          <button
                            onClick={e => { e.stopPropagation(); setOpenSuites(expanded ? null : p.id); }}
                            className="text-xs mt-0.5 font-semibold"
                            style={{ color: chosen.length === 0 ? '#d41f27' : '#1a4f8a' }}
                          >
                            {chosen.length === 0
                              ? 'No suites selected'
                              : allChosen
                                ? `All ${allSuites.length} suite${allSuites.length === 1 ? '' : 's'}`
                                : `${chosen.length} of ${allSuites.length} suites`}
                            {expanded ? ' ▴' : ' ▾'}
                          </button>
                        ) : (
                          <p className="text-xs mt-0.5" style={{ color: '#9aaba8' }}>
                            {chosen.length} suite{chosen.length === 1 ? '' : 's'}
                          </p>
                        )
                      )}
                      {noCoords && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#b8860b' }}>
                          <AlertTriangle className="w-3 h-3" /> No map location on file
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5" style={{ color: '#9aaba8' }} />
                      {canEdit ? (
                        // Free time entry rather than fixed slots — tours start
                        // at 9:05 or 9:10 as often as on the half hour.
                        <input
                          type="time"
                          value={r.stop.time}
                          onChange={e => setTime(p.id, e.target.value)}
                          step={300}
                          aria-label={`Time for ${p.name}`}
                          className="rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                          style={{ backgroundColor: '#f5f2ec', border: '1px solid #e5e1d8', color: '#3a4a47' }}
                        />
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: '#3a4a47' }}>{formatTime(r.stop.time)}</span>
                      )}
                    </div>
                    {canEdit && (
                    <button
                      onClick={() => removeStop(p.id)}
                      title={`Remove ${p.name}`}
                      aria-label={`Remove ${p.name}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                      style={{ color: '#9aaba8' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#d41f27'; e.currentTarget.style.backgroundColor = 'rgba(212,31,39,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#9aaba8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>

                  {canEdit && expanded && allSuites.length > 0 && (
                    <div className="px-4 pb-3 pl-14" style={{ backgroundColor: '#faf9f6' }}>
                      <div className="flex items-center gap-3 mb-1.5">
                        <button onClick={() => setAllSuites(p.id, allSuiteIds, true)}
                          className="text-xs font-semibold" style={{ color: '#1a4f8a' }}>Select all</button>
                        <button onClick={() => setAllSuites(p.id, allSuiteIds, false)}
                          className="text-xs font-semibold" style={{ color: '#9aaba8' }}>Clear</button>
                      </div>
                      {allSuites.map(su => {
                        const on = chosen.some(c => c.id === su.id);
                        return (
                          <label key={su.id} className="flex items-center gap-2 py-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleSuite(p.id, su.id, allSuiteIds)}
                              style={{ accentColor: '#d41f27' }}
                            />
                            <span className="text-xs" style={{ color: on ? '#1e2624' : '#9aaba8' }}>
                              <span className="font-semibold">{su.suite_name || 'Suite'}</span>
                              {su.sf != null && ` · ${su.sf.toLocaleString()} SF`}
                              {su.base_rent != null && ` · $${Number(su.base_rent).toFixed(2)}/SF`}
                              {su.available && ` · ${su.available}`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
            {canEdit && <p className="text-xs mb-6" style={{ color: '#9aaba8' }}>Drag a row to reorder — the route updates to match.</p>}
          </>
        )}

        {/* Map second */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #e5e1d8' }}>
          <div ref={mapContainer} style={{ height: 460, width: '100%', backgroundColor: '#e8e4df' }} />
        </div>
        {missingCoords > 0 && (
          <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: '#b8860b' }}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {missingCoords} {missingCoords === 1 ? 'stop is' : 'stops are'} missing a map location and {missingCoords === 1 ? "isn't" : "aren't"} drawn on the route.
          </p>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Builds the print-only itinerary. The app hides #root when printing (see
// index.css), so this node is what lands in the PDF.
function renderPrintView(
  clientName: string,
  tourDate: string,
  stops: { property: Property; time: string }[],
  mapImage: string,
) {
  const id = 'print-tour';
  document.getElementById(id)?.remove();
  const root = document.createElement('div');
  root.id = id;

  const rows = stops.map((s, i) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e1d8;font-weight:700;width:38px">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e1d8;font-weight:700;white-space:nowrap">${formatTime(s.time)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e1d8">
        <div style="font-weight:700">${escapeHtml(s.property.name)}</div>
        <div style="font-size:11px;color:#7a8a87">${escapeHtml(formatAddress(s.property.address))}</div>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e1d8;font-size:11px;color:#3a4a47">${escapeHtml(s.property.market ?? '')}</td>
    </tr>`).join('');

  root.innerHTML = `
    <div style="font-family:Montserrat,system-ui,sans-serif;color:#1e2624;padding:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #d41f27;padding-bottom:8px;margin-bottom:14px">
        <div>
          <div style="font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">Survey &amp; Tour Itinerary</div>
          ${clientName ? `<div style="font-size:12px;color:#7a8a87;margin-top:2px">${escapeHtml(clientName)}</div>` : ''}
          ${tourDate ? `<div style="font-size:12px;color:#3a4a47;font-weight:700;margin-top:2px">${escapeHtml(formatTourDate(tourDate))}</div>` : ''}
        </div>
        <div style="font-size:11px;color:#7a8a87">${stops.length} stop${stops.length === 1 ? '' : 's'}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f2ec">
            <th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7a8a87">#</th>
            <th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7a8a87">Time</th>
            <th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7a8a87">Property</th>
            <th style="text-align:left;padding:6px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7a8a87">Submarket</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${mapImage ? `<div style="margin-top:16px"><img src="${mapImage}" style="width:100%;border:1px solid #e5e1d8;border-radius:8px" /></div>` : ''}
      <div style="margin-top:14px;font-size:10px;color:#7a8a87">ECR // 114 W 7th St // Suite 1000 // Austin, TX 78701 // ecrtx.com</div>
    </div>`;

  document.body.appendChild(root);
  // Drop the node once the print dialog closes so it never affects the app.
  const cleanup = () => { document.getElementById(id)?.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
}
