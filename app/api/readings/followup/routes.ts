import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

interface PlanetPlacement {
  name: string;
  sign: string;
  degree: string;
  house?: string;
}

interface ProfectionData {
  age: number;
  activatedHouse: number;
  activatedSign: string;
  timeLord: string;
}

interface FollowupRequestBody {
  question: string;
  originalReading: string;
  originalTitle: string;
  topic: string;
  tropical: { planets: PlanetPlacement[] };
  profection: ProfectionData;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as FollowupRequestBody;

    if (!body.question || !body.originalReading || !body.tropical || !body.profection) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const planetList = body.tropical.planets
      .map(p => `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}`)
      .join("\n");

    const prompt = [
      "CRITICAL: Mobile screen. Short, heavy sentences. No fluff. Go deeper — do not repeat the original reading.",
      "",
      "═══════════════════════════════════════════",
      "CONTEXT",
      "═══════════════════════════════════════════",
      `Topic: ${body.topic}`,
      `Profection Year: House ${body.profection.activatedHouse} (${body.profection.activatedSign}), Time Lord: ${body.profection.timeLord}`,
      "",
      "NATAL PLACEMENTS:",
      planetList,
      "",
      "ORIGINAL READING:",
      body.originalReading,
      "",
      "THEIR FOLLOW-UP QUESTION:",
      `"${body.question}"`,
      "",
      "═══════════════════════════════════════════",
      "RESPONSE RULES",
      "═══════════════════════════════════════════",
      "- Answer ONLY what they asked. Stay on that thread.",
      "- Build directly on the original reading — reference specific placements named in it.",
      "- Go deeper on the specific planet, house, or timing they're asking about.",
      "- 'You' in every sentence. No passive voice. No hedging.",
      "- Outcomes as facts. Named degrees and house numbers.",
      "- 3-5 compact paragraphs maximum. No headers.",
      "- End with one sentence that either closes the loop or points to what they should watch next.",
      "",
      "Return ONLY a valid JSON object:",
      '{ "title": "A sharp 4-6 word title specific to their question", "content": "The deeper response as flowing prose." }',
    ].join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: "You are a precision astrologer. You just gave this person a reading and they have a follow-up question. You know their chart completely. Speak directly, go deeper, answer exactly what they asked. Output ONLY raw valid JSON — no markdown, no code fences.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[followup] Claude error:", err);
      return NextResponse.json({ error: "Failed to generate response. Please try again." }, { status: 502 });
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text;

    if (!rawText) {
      return NextResponse.json({ error: "No response from reading engine." }, { status: 502 });
    }

    let parsed: { title: string; content: string };
    try {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.slice(cleaned.indexOf("\n") + 1);
      if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
      cleaned = cleaned.trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
      }
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[followup] Failed to parse response:", String(parseErr));
      return NextResponse.json({ error: "Failed to parse response. Please try again." }, { status: 422 });
    }

    console.log(`[followup] generated for ${userId}`);

    return NextResponse.json({ title: parsed.title, content: parsed.content }, { status: 200 });

  } catch (error) {
    console.error("[followup] Unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}