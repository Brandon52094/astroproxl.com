// lib/tiktokEvents.ts
// Server-side TikTok Events API helper — used for Purchase events fired
// from the Stripe webhook, where there's no browser available to fire
// the client-side pixel script.

const TIKTOK_PIXEL_ID = "D8TOKB3C77UBEINTG3S0";
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN!;
const TIKTOK_EVENTS_API_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

interface TrackPurchaseParams {
  email?: string;
  amountCents: number;
  currency?: string;
  eventId?: string; // dedupe key — use Stripe session ID
  platform?: "web" | "pwa" | "mobile_app"; // Platform where the event originated
}

// Hash email with SHA-256 — TikTok requires hashed PII, never send raw email
async function sha256Hash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function trackServerPurchase(params: TrackPurchaseParams): Promise<void> {
  try {
    const { email, amountCents, currency = "USD", eventId, platform } = params;

    const hashedEmail = email ? await sha256Hash(email) : undefined;

    // Determine event source - default to "web" if not specified
    const eventSource = platform || "web";

    const payload = {
      event_source: eventSource, // Now "web", "pwa", or "mobile_app"
      event_source_id: TIKTOK_PIXEL_ID,
      data: [
        {
          event: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          user: hashedEmail ? { email: hashedEmail } : undefined,
          properties: {
            currency,
            value: amountCents / 100,
          },
        },
      ],
    };

    const response = await fetch(TIKTOK_EVENTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": TIKTOK_ACCESS_TOKEN,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[tiktokEvents] Failed to send Purchase event:", errText);
      return;
    }

    console.log(`[tiktokEvents] Purchase event sent — $${amountCents / 100} ${currency} (platform: ${eventSource})`);
  } catch (err) {
    // Never let a tracking failure break the actual payment flow
    console.error("[tiktokEvents] Unexpected error sending Purchase event:", err);
  }
}