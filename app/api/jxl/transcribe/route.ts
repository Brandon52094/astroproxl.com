import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Audio → text for JXL.
 *
 * Claude has no audio input, so speech has to be transcribed before it can
 * reach /api/jxl/ask. Whisper handles accents, rambling, crying, and long
 * pauses far better than the browser's built-in SpeechRecognition, which is
 * unreliable on iOS and cuts out mid-sentence. For a paid feature where
 * transcription quality IS reading quality, that difference matters.
 *
 * Requires OPENAI_API_KEY in the environment.
 * Put at: app/api/jxl/transcribe/route.ts
 */

// Whisper's own cap is 25MB. We stop well short — a JXL clip is a couple of
// minutes at most, and anything larger is a bug or an abuse attempt.
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[jxl/transcribe] OPENAI_API_KEY is not set.");
      return NextResponse.json(
        { error: "Voice isn't configured yet. You can type instead." },
        { status: 503 }
      );
    }

    const form = await request.formData();
    const file = form.get("audio");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No audio received." }, { status: 400 });
    }

    const blob = file as File;

    if (blob.size === 0) {
      return NextResponse.json(
        { error: "We didn't catch that. Hold the button and try again." },
        { status: 400 }
      );
    }

    if (blob.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That was a bit long. Try again in a shorter burst." },
        { status: 413 }
      );
    }

    // Safari records audio/mp4, Chrome records audio/webm. Whisper accepts
    // both, but it infers the format from the FILENAME, so the extension has
    // to match what was actually recorded or it rejects the upload.
    const type = blob.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("m4a")
      ? "mp4"
      : type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
      ? "wav"
      : "webm";

    const upstream = new FormData();
    upstream.append("file", blob, `speech.${ext}`);
    upstream.append("model", "whisper-1");
    // Nudges Whisper toward everyday phrasing rather than hearing chart jargon.
    upstream.append(
      "prompt",
      "The speaker is describing a personal situation in their life — work, money, a relationship, a decision they're facing."
    );

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[jxl/transcribe] Whisper error:", res.status, detail.slice(0, 400));
      return NextResponse.json(
        { error: "Couldn't hear that clearly. Try again, or type it instead." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = String(data?.text ?? "").trim();

    if (text.length < 2) {
      return NextResponse.json(
        { error: "We didn't catch that. Hold the button and try again." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text }, { status: 200 });
  } catch (error) {
    console.error("[jxl/transcribe] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. You can type instead." },
      { status: 500 }
    );
  }
}