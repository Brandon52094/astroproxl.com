import { NextRequest, NextResponse } from "next/server";

// Uses OpenStreetMap Nominatim — no API key required
// Rate limit: 1 request/second, must include a descriptive User-Agent
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

interface ResolvedPlace {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
}

async function getTimezone(lat: number, lon: number): Promise<string> {
  // Try timeapi.io — free, no key required
  try {
    const response = await fetch(
      `https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lon}`,
      {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (response.ok) {
      const data = await response.json();
      if (data?.timeZone) {
        console.log("[geocode] timezone resolved:", data.timeZone, "via timeapi.io");
        return data.timeZone;
      }
    }
  } catch (e) {
    console.warn("[geocode] timeapi.io failed:", e);
  }

  // Fallback: try worldtimeapi.org
  try {
    const response = await fetch(
      `https://worldtimeapi.org/api/timezone/`,
      { signal: AbortSignal.timeout(3000) }
    );
    // worldtimeapi doesn't do coord lookup directly, skip to next fallback
  } catch {}

  // Fallback: rough offset from longitude (±15° per hour)
  // Not great but better than UTC for most birth places
  const offsetHours = Math.round(lon / 15);
  const sign = offsetHours >= 0 ? "+" : "-";
  const abs = Math.abs(offsetHours).toString().padStart(2, "0");
  const roughTz = `Etc/GMT${sign}${abs}`;
  console.warn(`[geocode] timezone APIs failed, using rough offset: ${roughTz} for lat=${lat} lon=${lon}`);
  return roughTz;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "A valid place name is required." },
        { status: 400 }
      );
    }

    // Search Nominatim
    const searchUrl = new URL(NOMINATIM_URL);
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("limit", "1");
    searchUrl.searchParams.set("addressdetails", "1");

    const nominatimResponse = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "DirectFuturePredictions/1.0 (astrology chart app)",
        "Accept-Language": "en",
      },
    });

    if (!nominatimResponse.ok) {
      throw new Error(`Nominatim error: ${nominatimResponse.status}`);
    }

    const results: NominatimResult[] = await nominatimResponse.json();

    if (!results || results.length === 0) {
      return NextResponse.json(
        { error: "No matching place found. Try a more specific location." },
        { status: 404 }
      );
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Build a clean label from address components
    const addr = result.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village ?? "";
    const state = addr.state ?? "";
    const country = addr.country ?? "";
    const label = [city, state, country].filter(Boolean).join(", ") || result.display_name;

    // Get timezone for the coordinates
    const timezone = await getTimezone(lat, lon);

    const place: ResolvedPlace = { label, lat, lon, timezone };

    return NextResponse.json({ place });
  } catch (error) {
    console.error("Geocode route error:", error);
    return NextResponse.json(
      { error: "Couldn't verify that birth place. Please try again." },
      { status: 500 }
    );
  }
}