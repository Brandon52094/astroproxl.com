import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// app/api/reading/transcribe/session/route.ts
// Creates an ephemeral token; OPENAI_API_KEY never reaches the browser.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice unavailable" }, { status: 503 });

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {type: "audio/pcm", rate: 24000},
              transcription: {
                model: "gpt-4o-transcribe",
                language: "en",
                prompt: "A personal astrology reading question about relationships, love, career, money, life decisions, or a difficult situation.",
              },
              turn_detection: {type: "server_vad", silence_duration_ms: 700, prefix_padding_ms: 300},
            },
          },
        },
      }),
      cache: "no-store",
    });
    if (!upstream.ok) {
      console.error("[reading/realtime-session]", upstream.status, (await upstream.text()).slice(0, 200));
      return NextResponse.json({error:"Streaming unavailable"},{status:502});
    }
    return NextResponse.json(await upstream.json(), {headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"Streaming unavailable"},{status:502});
  }
}
