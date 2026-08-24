export interface AddressSuggestion {
  label: string; // "311 E Saint Elmo Rd, Austin, TX 78745"
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  class?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    'ISO3166-2-lvl4'?: string; // "US-TX"
  };
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const HEADERS = { 'User-Agent': 'ECR-Property-Portal/1.0' };

// Every ECR property is in Texas, so results are hard-bounded to the state.
// Without this the search returned same-named streets from anywhere in the US,
// and — because only results carrying a house number survive formatSuggestion —
// a nationwide result set often left nothing to show at all.
// Order is left,top,right,bottom (lon/lat).
const TEXAS_VIEWBOX = '-106.65,36.50,-93.51,25.84';

function formatSuggestion(r: NominatimResult): AddressSuggestion | null {
  const a = r.address;
  // Only offer real street addresses (house number + road). Anything else
  // (neighborhoods, counties, road centroids) is dropped — those are the
  // results whose coordinates land in the wrong spot.
  if (!a?.house_number || !a.road) return null;
  const city = a.city || a.town || a.village || a.hamlet || a.municipality || '';
  const state = a['ISO3166-2-lvl4']?.slice(-2) || a.state || '';
  const zip = a.postcode || '';
  const label = [`${a.house_number} ${a.road}`, city, `${state} ${zip}`.trim()]
    .filter(Boolean)
    .join(', ');
  return { label, lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  // limit=15 rather than 8: the house-number filter below discards a lot, and a
  // short list was frequently emptied entirely before it reached the dropdown.
  const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(query)}`
    + `&limit=15&addressdetails=1&countrycodes=us&layer=address&dedupe=1`
    + `&viewbox=${TEXAS_VIEWBOX}&bounded=1`;
  const res = await fetch(url, { headers: HEADERS });
  // Nominatim rate-limits (roughly 1 request/second) and answers with a non-JSON
  // body when it does. Parsing that threw and the dropdown silently stayed empty.
  if (!res.ok) return [];
  const data: NominatimResult[] = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  // Plain address points (class "place"/"building") carry the parcel's rooftop
  // coordinates; POIs sharing the address (shops etc.) can be mapped elsewhere.
  // Put address points first so dedupe keeps their coordinates.
  const ranked = [...data].sort((a, b) => {
    const rank = (r: NominatimResult) => (r.class === 'place' || r.class === 'building' ? 0 : 1);
    return rank(a) - rank(b);
  });
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const r of ranked) {
    const s = formatSuggestion(r);
    if (s && !seen.has(s.label)) {
      seen.add(s.label);
      out.push(s);
    }
  }
  return out.slice(0, 5);
}

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
};

/**
 * Normalize a verbose Nominatim display_name already stored in the DB
 * ("311, East Saint Elmo Road, Southpark, Austin, Travis County, Texas,
 * 78745, United States") down to "311 East Saint Elmo Road, Austin, TX 78745".
 * Strings that don't look like that pattern are returned untouched.
 */
export function formatAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 5 || parts[parts.length - 1] !== 'United States') return raw;
  parts.pop();

  const zipIdx = parts.findIndex(p => /^\d{5}(-\d{4})?$/.test(p));
  const zip = zipIdx !== -1 ? parts[zipIdx] : '';
  const stateIdx = zipIdx > 0 ? zipIdx - 1 : parts.length - 1;
  const state = STATE_ABBR[parts[stateIdx]] ?? parts[stateIdx];

  // Street: leading house number gets joined onto the road name. A POI name
  // ahead of the house number ("Ignite Outdoor Kitchens, 311, ...") is dropped.
  const isHouseNum = (p: string) => /^\d+[A-Za-z]?(-\d+)?$/.test(p);
  let street = parts[0];
  let streetEnd = 0;
  if (isHouseNum(parts[0]) && parts.length > 1) {
    street = `${parts[0]} ${parts[1]}`;
    streetEnd = 1;
  } else if (parts.length > 2 && isHouseNum(parts[1])) {
    street = `${parts[1]} ${parts[2]}`;
    streetEnd = 2;
  }

  // City: the element just before the county (or before the state when no
  // county is present). Neighborhoods between road and city fall away.
  const countyIdx = parts.findIndex(p => /County$/.test(p) || /Parish$/.test(p));
  const cityIdx = (countyIdx > 0 ? countyIdx : stateIdx) - 1;
  const city = cityIdx > streetEnd ? parts[cityIdx] : '';

  return [street, city, `${state} ${zip}`.trim()].filter(Boolean).join(', ');
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Prefer an exact street-address match, then fall back to a looser search
    // so partial addresses still locate something. Both stay inside Texas —
    // the old fallback had no country restriction at all and could drop a pin
    // in another state.
    const bounds = `&viewbox=${TEXAS_VIEWBOX}&bounded=1`;
    for (const layer of [`&countrycodes=us&layer=address${bounds}`, `&countrycodes=us${bounds}`]) {
      const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1${layer}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) continue;
      const data: NominatimResult[] = await res.json().catch(() => []);
      if (Array.isArray(data) && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    /* fall through */
  }
  return null;
}
