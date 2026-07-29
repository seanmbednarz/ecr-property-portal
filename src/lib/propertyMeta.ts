// Property type and listing-status options + helpers shared across forms,
// cards, the detail page, and filters.

export const PROPERTY_TYPES = [
  'Office', 'Industrial', 'Flex', 'Land', 'Mixed-Use', 'Retail', 'Medical', 'Executive Office Suites',
];

export const LISTING_STATUSES = [
  'For Lease', 'For Sale', 'For Sublease', '100% Leased', 'Sold',
];

const STATUS_COLORS: Record<string, string> = {
  'For Lease': '#d41f27',
  'For Sale': '#2e7d4f',
  'For Sublease': '#2b6cb0',
  '100% Leased': '#6b7280',
  'Sold': '#3a4a47',
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#3a4a47';
}

// A property's types, falling back to the legacy single property_type field.
export function propertyTypesOf(p: { property_types?: string[] | null; property_type?: string | null }): string[] {
  if (p.property_types && p.property_types.length) return p.property_types;
  return p.property_type ? [p.property_type] : [];
}

export function listingStatusOf(p: { listing_status?: string[] | null }): string[] {
  return p.listing_status ?? [];
}

// ─── Suite lease vs. sale ───────────────────────────────────────────────────
// Each suite is quoted either for lease (default) or for sale. Sale suites
// read base_rent as price per SF, ignore op. exp., and headline sale_price
// (falling back to price/SF × SF) instead of monthly/annual rent.

export function isSaleSuite(s: { listing_type?: string | null }): boolean {
  return s.listing_type === 'sale';
}

export function salePriceOf(
  s: { sale_price?: number | null; base_rent?: number | null; sf?: number | null },
): number | null {
  if (s.sale_price != null) return s.sale_price;
  if (s.base_rent != null && s.sf != null) return s.base_rent * s.sf;
  return null;
}

// Suites visible to a given client: suites tagged with client_ids are only
// shown to those clients; untagged suites show to everyone. clientId null
// (admin/broker "All Clients" view) sees everything.
export function suitesForClient<T extends { client_ids?: string[] | null }>(
  suites: T[],
  clientId: string | null,
): T[] {
  if (!clientId) return suites;
  return suites.filter(s => !s.client_ids?.length || s.client_ids.includes(clientId));
}
