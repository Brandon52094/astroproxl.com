import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// app/api/reading/transcribe/session/route.ts
// Creates an ephemeral token; OPENAI_API_KEY never reaches the browser.
//
// This session only powers the LIVE PREVIEW (the words shown while the user
// holds the mic). The submitted question always comes from Whisper on the full
// recording (/api/jxl/transcribe), so the preview is tuned for speed.
//
// Primary: gpt-live-transcribe streams text WHILE the user is speaking. It has
// no server-side pause detection; the client commits when the button is
// released. If OpenAI rejects that session (model not enabled for this
// account, or not available over WebRTC), fall back to gpt-4o-transcribe,
// which only sends text after short pauses.

const PROMPT =
  "A personal astrology reading question about relationships, love, career, money, life decisions, or a difficult situation.";

const LIVE_SESSION = {
  type: "transcription",
  audio: {
    input: {
      format: { type: "audio/pcm", rate: 24000 },
      noise_reduction: { type: "near_field" },
      transcription: {
        model: "gpt-live-transcribe",
        prompt: PROMPT,
        languages: ["en"],
        // Hints only. Terms users may say that a general model could mishear.
        keywords: ["birth chart", "natal chart", "Mercury retrograde", "Saturn return", "horoscope", "AstroPro"],
        // "low" = live-caption latency. "minimal" is faster but rougher.
        delay: "low",
      },
      turn_detection: null,
    },
  },
};

const FALLBACK_SESSION = {
  type: "transcription",
  audio: {
    input: {
      format: { type: "audio/pcm", rate: 24000 },
      noise_reduction: { type: "near_field" },
      transcription: {
        model: "gpt-4o-transcribe",
        language: "en",
        prompt: PROMPT,
      },
      // Text appears at the small pauses between clauses.
      turn_detection: { type: "server_vad", silence_duration_ms: 300, prefix_padding_ms: 300 },
    },
  },
};

async function createClientSecret(apiKey: string, session: unknown) {
  return fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice unavailable" }, { status: 503 });

  // The client sends { mode: "fallback" } if a live session got a token but
  // then failed to connect over WebRTC.
  let wantFallback = false;
  try {
    const body = await request.json();
    wantFallback = body?.mode === "fallback";
  } catch {
    // No body: try the live model first.
  }

  try {
    let upstream = await createClientSecret(apiKey, wantFallback ? FALLBACK_SESSION : LIVE_SESSION);
    let mode: "live" | "fallback" = wantFallback ? "fallback" : "live";

    // 4xx = OpenAI refused this session config. Try the older model instead.
    if (!wantFallback && upstream.status >= 400 && upstream.status < 500 && upstream.status !== 401 && upstream.status !== 429) {
      console.warn(
        "[reading/realtime-session] gpt-live-transcribe rejected, using fallback:",
        upstream.status,
        (await upstream.text()).slice(0, 300)
      );
      upstream = await createClientSecret(apiKey, FALLBACK_SESSION);
      mode = "fallback";
    }

    if (!upstream.ok) {
      console.error("[reading/realtime-session]", upstream.status, (await upstream.text()).slice(0, 200));
      return NextResponse.json({ error: "Streaming unavailable" }, { status: 502 });
    }

    const data = await upstream.json();
    return NextResponse.json({ ...data, mode }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Streaming unavailable" }, { status: 502 });
  }
}
