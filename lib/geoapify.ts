import type {
  GeoapifyFeatureCollection,
  PlaceSuggestion,
  ResolvedPlace,
} from "@/types/geo";

const GEOAPIFY_BASE = "https://api.geoapify.com/v1/geocode";

function getApiKey() {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEOAPIFY_API_KEY");
  }
  return apiKey;
}

function buildAutocompleteUrl(text: string) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    text,
    format: "json",
    limit: "5",
    apiKey,
  });
  return `${GEOAPIFY_BASE}/autocomplete?${params.toString()}`;
}

function buildGeocodeUrl(text: string) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    text,
    format: "json",
    limit: "1",
    apiKey,
  });
  return `${GEOAPIFY_BASE}/search?${params.toString()}`;
}

function mapFeatureToSuggestion(
  feature: GeoapifyFeatureCollection["features"][number]
): PlaceSuggestion | null {
  const props = feature?.properties;
  const label = props?.formatted?.trim();
  if (!label) return null;

  return {
    id: props.place_id || label,
    label,
    city: props.city,
    state: props.state,
    country: props.country,
    lat: props.lat,
    lon: props.lon,
  };
}

export async function fetchPlaceSuggestions(text: string): Promise<PlaceSuggestion[]> {
  const query = text.trim();
  if (!query) return [];

  const response = await fetch(buildAutocompleteUrl(query), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Geoapify autocomplete failed: ${response.status}`);
  }

  const data = (await response.json()) as GeoapifyFeatureCollection;

  return (data.features ?? [])
    .map((feature) => mapFeatureToSuggestion(feature))
    .filter((item): item is PlaceSuggestion => Boolean(item));
}

export async function geocodePlace(text: string): Promise<ResolvedPlace | null> {
  const query = text.trim();
  if (!query) return null;

  const response = await fetch(buildGeocodeUrl(query), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Geoapify geocode failed: ${response.status}`);
  }

  const data = (await response.json()) as GeoapifyFeatureCollection;
  const first = data.features?.[0];
  const props = first?.properties;

  if (!props?.formatted || typeof props.lat !== "number" || typeof props.lon !== "number") {
    return null;
  }

  return {
    label: props.formatted,
    city: props.city,
    state: props.state,
    country: props.country,
    lat: props.lat,
    lon: props.lon,
  };
}