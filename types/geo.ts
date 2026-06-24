5export type GeoapifyFeature = {
  properties?: {
    formatted?: string;
    lat?: number;
    lon?: number;
    city?: string;
    state?: string;
    country?: string;
    country_code?: string;
    result_type?: string;
    place_id?: string;
  };
};

export type GeoapifyFeatureCollection = {
  features?: GeoapifyFeature[];
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
};

export type ResolvedPlace = {
  label: string;
  city?: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
};