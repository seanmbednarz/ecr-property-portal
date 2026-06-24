export interface Property {
  id: string;
  name: string;
  address: string;
  description: string | null;
  hero_image_url: string | null;
  property_type: string;
  market: string;
  total_sf: number | null;
  broker_name: string;
  broker_photo_url: string | null;
  lat: number | null;
  lng: number | null;
  year_built: number | null;
  parking_ratio: string | null;
  walk_score: number | null;
  property_notes: string | null;
  sublabel: string | null;
  brochure_url: string | null;
  target_sf: number | null;
  max_contiguous_sf: number | null;
  broker_notes: string[] | null;
  scores: { pedestrian: number; cycling: number; car: number; transit: number } | null;
  client: string | null;
  slug: string;
  created_at: string;
  suites?: Suite[];
  brokers?: Broker[];
}

export interface Suite {
  id: string;
  property_id: string;
  suite_name: string;
  sf: number | null;
  base_rent: number | null;
  op_exp: number | null;
  full_svc: number | null;
  monthly_rent: number | null;
  available: string | null;
  tour_url: string | null;
  notes: string | null;
  display_order: number;
}

export interface Broker {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  display_order: number;
}

export interface Note {
  id: string;
  user_id: string;
  property_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}
