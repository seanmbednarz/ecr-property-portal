import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Property } from '../types';

const CARTO_VOYAGER = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DEFAULT_CENTER: [number, number] = [-97.743057, 30.267153];

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

function pinColor(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_PIN_COLOR;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  el: HTMLElement;
  pinWrapper: HTMLElement;
  pinInner: HTMLElement;
  pinTail: HTMLElement;
  type: string;
}

function createMarkerElement(
  index: number,
  type: string,
  selected: boolean,
): { el: HTMLElement; pinWrapper: HTMLElement; pinInner: HTMLElement; pinTail: HTMLElement } {
  const color = selected ? '#d41f27' : pinColor(type);
  const borderColor = selected ? 'white' : 'rgba(255,255,255,0.4)';
  const shadow = selected
    ? '0 4px 14px rgba(0,0,0,0.45)'
    : '0 2px 8px rgba(0,0,0,0.35)';

  const el = document.createElement('div');
  el.style.cssText = [
    'cursor:pointer',
    `z-index:${selected ? 100 : 10}`,
  ].join(';');

  const pinWrapper = document.createElement('div');
  pinWrapper.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'transform-origin:bottom center',
    `transform:scale(${selected ? 1.35 : 1})`,
    'transition:transform 0.2s ease',
  ].join(';');

  const pinInner = document.createElement('div');
  pinInner.style.cssText = [
    'width:28px',
    'height:28px',
    'border-radius:50%',
    `background:${color}`,
    `border:2px solid ${borderColor}`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'color:white',
    'font-size:11px',
    'font-weight:700',
    'font-family:system-ui,sans-serif',
    `box-shadow:${shadow}`,
    'transition:background 0.2s,border-color 0.2s,box-shadow 0.2s',
  ].join(';');
  pinInner.textContent = String(index);

  const pinTail = document.createElement('div');
  pinTail.style.cssText = [
    'width:0',
    'height:0',
    'border-left:5px solid transparent',
    'border-right:5px solid transparent',
    `border-top:7px solid ${color}`,
    'margin-top:-1px',
    'transition:border-top-color 0.2s',
  ].join(';');

  pinWrapper.appendChild(pinInner);
  pinWrapper.appendChild(pinTail);
  el.appendChild(pinWrapper);
  return { el, pinWrapper, pinInner, pinTail };
}

function createOfficeMarkerElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'cursor:default;z-index:50;';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'transform-origin:bottom center',
  ].join(';');

  const circle = document.createElement('div');
  circle.style.cssText = [
    'width:34px',
    'height:34px',
    'border-radius:50%',
    'background:#f59e0b',
    'border:2.5px solid white',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-shadow:0 3px 10px rgba(0,0,0,0.4)',
    'font-size:16px',
    'line-height:1',
  ].join(';');
  circle.textContent = '★';
  circle.style.color = 'white';

  const tail = document.createElement('div');
  tail.style.cssText = [
    'width:0',
    'height:0',
    'border-left:5px solid transparent',
    'border-right:5px solid transparent',
    'border-top:8px solid #f59e0b',
    'margin-top:-1px',
  ].join(';');

  wrapper.appendChild(circle);
  wrapper.appendChild(tail);
  el.appendChild(wrapper);
  return el;
}

export interface OfficeLocation {
  lat: number;
  lng: number;
  address: string;
}

interface MapViewProps {
  properties: Property[];
  selectedId: string | null;
  onSelect: (p: Property) => void;
  officeLocation?: OfficeLocation | null;
}

export default function MapView({ properties, selectedId, onSelect, officeLocation }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const officeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedIdRef = useRef(selectedId);

  useEffect(() => { onSelectRef.current = onSelect; });
  useEffect(() => { selectedIdRef.current = selectedId; });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_VOYAGER,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
      markersRef.current.clear();
      officeMarkerRef.current = null;
    };
  }, []);

  // Recreate property markers whenever the property list changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const addMarkers = () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();

      const valid = properties.filter(p => p.lat != null && p.lng != null);
      valid.forEach((p, i) => {
        const isSelected = p.id === selectedIdRef.current;
        const { el, pinWrapper, pinInner, pinTail } = createMarkerElement(i + 1, p.property_type, isSelected);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(p);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lng!, p.lat!])
          .addTo(m);

        markersRef.current.set(p.id, { marker, el, pinWrapper, pinInner, pinTail, type: p.property_type });
      });

      if (valid.length > 0 && !selectedIdRef.current) {
        const lngs = valid.map(p => p.lng!);
        const lats = valid.map(p => p.lat!);
        m.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 14, duration: 800 },
        );
      }
    };

    if (m.isStyleLoaded()) {
      addMarkers();
    } else {
      m.once('load', addMarkers);
    }
  }, [properties]);

  // Add/update/remove office location marker
  useEffect(() => {
    const m = mapRef.current;

    const addOfficeMarker = () => {
      officeMarkerRef.current?.remove();
      officeMarkerRef.current = null;

      if (!officeLocation) return;

      const el = createOfficeMarkerElement();

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -44],
        className: 'office-popup',
      }).setHTML(
        `<div style="font-family:system-ui,sans-serif;padding:6px 10px;line-height:1.4;">
          <p style="font-size:11px;font-weight:700;color:#1e2624;margin:0 0 2px;">Current Office</p>
          <p style="font-size:11px;color:#7a8a87;margin:0;">${officeLocation.address}</p>
        </div>`
      );

      el.addEventListener('mouseenter', () => popup.addTo(m!));
      el.addEventListener('mouseleave', () => popup.remove());

      officeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([officeLocation.lng, officeLocation.lat])
        .addTo(m!);
    };

    if (!m) return;
    if (m.isStyleLoaded()) {
      addOfficeMarker();
    } else {
      m.once('load', addOfficeMarker);
    }

    return () => {
      officeMarkerRef.current?.remove();
      officeMarkerRef.current = null;
    };
  }, [officeLocation]);

  // Update pin appearance when selection changes
  useEffect(() => {
    markersRef.current.forEach(({ el, pinWrapper, pinInner, pinTail, type }, id) => {
      const isSelected = id === selectedId;
      const color = isSelected ? '#d41f27' : pinColor(type);
      el.style.zIndex = String(isSelected ? 100 : 10);
      pinWrapper.style.transform = `scale(${isSelected ? 1.35 : 1})`;
      pinInner.style.background = color;
      pinInner.style.borderColor = isSelected ? 'white' : 'rgba(255,255,255,0.4)';
      pinInner.style.boxShadow = isSelected
        ? '0 4px 14px rgba(0,0,0,0.45)'
        : '0 2px 8px rgba(0,0,0,0.35)';
      pinTail.style.borderTopColor = color;
    });

    if (selectedId) {
      const entry = markersRef.current.get(selectedId);
      if (entry && mapRef.current) {
        const { lng, lat } = entry.marker.getLngLat();
        mapRef.current.easeTo({
          center: [lng, lat],
          zoom: Math.max(mapRef.current.getZoom(), 13),
          duration: 600,
        });
      }
    }
  }, [selectedId]);

  const mappedCount = properties.filter(p => p.lat != null && p.lng != null).length;
  const shownTypes = Array.from(
    new Set(properties.filter(p => p.lat != null && p.lng != null).map(p => p.property_type)),
  );

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Count badge */}
      <div
        className="absolute top-3 left-3 z-[500] px-3 py-2 rounded-xl shadow-lg backdrop-blur-sm text-sm font-semibold"
        style={{ backgroundColor: 'rgba(30,38,36,0.9)', color: 'white', border: '1px solid rgba(136,152,147,0.2)' }}
      >
        <span style={{ color: '#d41f27' }}>{mappedCount}</span>
        <span style={{ color: '#889893' }}> propert{mappedCount !== 1 ? 'ies' : 'y'} plotted</span>
      </div>

      {/* Color legend */}
      {(shownTypes.length > 1 || officeLocation) && (
        <div
          className="absolute bottom-10 left-3 z-[500] px-3 py-2 rounded-xl shadow-lg flex flex-wrap gap-x-3 gap-y-1.5 max-w-xs"
          style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #e5e1d8' }}
        >
          {shownTypes.map(type => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: pinColor(type) }}
              />
              <span className="text-xs font-medium" style={{ color: '#3a4a47' }}>{type}</span>
            </div>
          ))}
          {officeLocation && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: '#f59e0b' }}
              />
              <span className="text-xs font-medium" style={{ color: '#3a4a47' }}>Current Office</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
