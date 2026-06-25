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
