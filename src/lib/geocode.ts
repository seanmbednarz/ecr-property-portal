export interface AddressSuggestion {
  label: string; // "311 East Saint Elmo Road, Austin, TX 78745"
  lat: number;
  lng: number;
}

// Mapbox Geocoding v6, not Nominatim. OSM's usage policy is explicit that the
// public Nominatim instance "does not support" auto-complete and that you
// "must not implement such a service on the client side using the API" — and
// it enforces that by stalling: measured against real typing, requests took
// 2-15s and returned nothing, so the dropdown simply stayed empty. The pile of
// query rewriting this file used to carry (abbreviation expansion, trailing
// direction moves, a Texas state-code filter) existed to paper over that and
// is handled natively here. Nominatim also placed 311 E Saint Elmo Rd about
// 500m off, on 701 — OSM's own reverse geocoder disagreed with its forward one.
const MAPBOX = 'https://api.mapbox.com/search/geocode/v6/forward';
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// minLon,minLat,maxLon,maxLat — note this is NOT the order Nominatim's viewbox
// used. Every ECR property is in Texas, and unlike Nominatim's viewbox this is
// a hard restriction, so no state-code filter is needed on the way back.
const TEXAS_BBOX = '-106.65,25.84,-93.51,36.50';
const AUSTIN = '-97.743,30.267'; // proximity bias: most properties are here

// Nominatim answered slowly rather than with an error, so a plain fetch could
// hang for the better part of a minute with nothing on screen. Mapbox is fast
// (~150-450ms measured) but the ceiling keeps a stalled request from wedging
// the dropdown open forever.
const TIMEOUT_MS = 8000;

interface MapboxFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    coordinates?: { accuracy?: string };
    context?: {
      address?: { address_number?: string; street_name?: string };
      street?: { name?: string };
      postcode?: { name?: string };
      place?: { name?: string };
      region?: { region_code?: string; name?: string };
    };
  };
}

// Mapbox grades how it derived a point. "rooftop"/"point" are real address
// records; "interpolated" is a guess along the street line, and that is the
// tier the genuinely wrong matches land in — "6300 Bridgepoint Pkwy" returns an
// interpolated "6300 Ridgepoint Drive, Irving" while the correct "Bridge Point
// Parkway" comes back as a point. Ranking on this both orders the dropdown and
// tells us when to bother with the compound-word retry below.
const ACCURACY_RANK: Record<string, number> = { rooftop: 0, parcel: 1, point: 2 };
const INTERPOLATED = 3;
function rank(f: MapboxFeature): number {
  return ACCURACY_RANK[f.properties.coordinates?.accuracy ?? ''] ?? INTERPOLATED;
}

// Within one accuracy tier Mapbox's own order can put a far-flung match first:
// "3711 S IH 35" led with Belton, two hours north, ahead of both Austin
// addresses. The proximity bias on the request is not enough on its own, so
// equal-accuracy results are broken apart by distance from Austin. Squared
// degrees are fine here — this only ever orders one tier against itself, and
// never drops a result, so a San Antonio or Houston address still appears.
function nearness(f: MapboxFeature): number {
  const [lng, lat] = f.geometry.coordinates;
  return (lat - 30.267) ** 2 + (lng + 97.743) ** 2;
}

function formatSuggestion(f: MapboxFeature): AddressSuggestion | null {
  const c = f.properties.context;
  const num = c?.address?.address_number;
  const street = c?.address?.street_name ?? c?.street?.name;
  // Only offer real street addresses. Without a house number the pin is the
  // street centroid, which is the class of result that lands in the wrong spot.
  if (!num || !street) return null;
  const city = c?.place?.name ?? '';
  const state = c?.region?.region_code ?? c?.region?.name ?? '';
  const zip = c?.postcode?.name ?? '';
  const [lng, lat] = f.geometry.coordinates;
  const label = [`${num} ${street}`, city, `${state} ${zip}`.trim()]
    .filter(Boolean)
    .join(', ');
  return { label, lat, lng };
}

// Mapbox, like OSM, sometimes spells a street as two words where people type it
// as one ("6300 Bridgepoint Parkway" vs "Bridge Point Parkway"). These are the
// pieces such names are built from; a long word is split only where BOTH halves
// are recognised, which keeps it from mangling ordinary names.
const NAME_PARTS = new Set([
  'bridge', 'point', 'park', 'creek', 'hill', 'wood', 'stone', 'north', 'south',
  'east', 'west', 'oak', 'ridge', 'view', 'brook', 'field', 'lake', 'river',
  'land', 'town', 'side', 'gate', 'cross', 'spring', 'valley', 'mount', 'glen',
  'dale', 'ford', 'port', 'haven', 'shore', 'grove', 'meadow', 'hollow', 'pine',
  'cedar', 'rock', 'sand', 'clear', 'fair', 'green', 'high', 'long', 'water',
  'summit', 'canyon', 'mesa', 'trail', 'run', 'bend', 'crest', 'lands',
]);

function splitCompounds(query: string): string | null {
  let changed = false;
  const words = query.split(/\s+/).map(word => {
    const bare = word.toLowerCase().replace(/[.,]+$/, '');
    if (bare.length < 8) return word;
    for (let i = 3; i <= bare.length - 3; i++) {
      if (NAME_PARTS.has(bare.slice(0, i)) && NAME_PARTS.has(bare.slice(i))) {
        changed = true;
        return `${word.slice(0, i)} ${word.slice(i)}`;
      }
    }
    return word;
  });
  return changed ? words.join(' ') : null;
}

async function runSearch(query: string, autocomplete: boolean, limit: number): Promise<MapboxFeature[]> {
  if (!TOKEN) return [];
  const url = `${MAPBOX}?q=${encodeURIComponent(query)}`
    + `&autocomplete=${autocomplete}&country=us&types=address&limit=${limit}`
    + `&bbox=${TEXAS_BBOX}&proximity=${AUSTIN}`
    + `&access_token=${TOKEN}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const features = data?.features;
    return Array.isArray(features) ? (features as MapboxFeature[]) : [];
  } catch {
    return []; // aborted, offline, or malformed
  }
}

function toSuggestions(features: MapboxFeature[]): AddressSuggestion[] {
  const ranked = [...features].sort((a, b) => rank(a) - rank(b) || nearness(a) - nearness(b));
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of ranked) {
    const s = formatSuggestion(f);
    if (s && !seen.has(s.label)) {
      seen.add(s.label);
      out.push(s);
    }
  }
  return out.slice(0, 5);
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const direct = await runSearch(query, true, 5);
  // Only retry when nothing came back at all, or when everything Mapbox found
  // was interpolated — that is the signature of a compound-word miss. A retry
  // can therefore never displace a result that already resolved properly.
  const weak = direct.length === 0 || direct.every(f => rank(f) === INTERPOLATED);
  if (!weak) return toSuggestions(direct);
  const split = splitCompounds(query);
  if (!split) return toSuggestions(direct);
  const retry = await runSearch(split, true, 5);
  const better = retry.some(f => rank(f) < INTERPOLATED);
  return toSuggestions(better ? retry : direct);
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // autocomplete=false: this runs on a complete address the user has finished
  // typing, so prefix matching only adds noise.
  const direct = await runSearch(address, false, 1);
  const best = toSuggestions(direct)[0];
  if (best && direct.some(f => rank(f) < INTERPOLATED)) return { lat: best.lat, lng: best.lng };
  const split = splitCompounds(address);
  if (split) {
    const retry = toSuggestions(await runSearch(split, false, 1))[0];
    if (retry) return { lat: retry.lat, lng: retry.lng };
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
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
 *
 * Still needed after the move to Mapbox: it cleans up rows written by the
 * previous geocoder, which are already in the database.
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
