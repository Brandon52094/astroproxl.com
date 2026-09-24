import { NextResponse } from "next/server";
import {
  buildDailyHoroscopePrompt,
  parseDailyHoroscopeResponse,
  formatDailyHoroscope,
  type DailyHoroscopeInput,
} from "@/lib/dailyHoroscopeEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenAITextContent = {
  type?: string;
  text?: string;
};

type OpenAIResponsePayload = {
  status?: "completed" | "incomplete" | "failed";
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    content?: Array<OpenAITextContent & { refusal?: string }>;
  }>;
  error?: { message?: string };
};

function extractOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Daily horoscope generation is not configured yet." },
        { status: 503 }
      );
    }

    const body = await request.json() as Partial<DailyHoroscopeInput>;
    if (!body.localDate || !Array.isArray(body.tropicalPlanets) || body.tropicalPlanets.length === 0) {
      return NextResponse.json(
        { error: "A saved birth chart is required to prepare today’s horoscope." },
        { status: 400 }
      );
    }

    const input: DailyHoroscopeInput = {
      localDate: body.localDate,
      tropicalPlanets: body.tropicalPlanets,
      currentTransits: Array.isArray(body.currentTransits) ? body.currentTransits : [],
      transitAspects: Array.isArray(body.transitAspects) ? body.transitAspects : [],
      ...(body.profection ? { profection: body.profection } : {}),
      ...(body.moonPhase ? { moonPhase: body.moonPhase } : {}),
    };

    const prompt = buildDailyHoroscopePrompt(input);
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // This is intentionally a small, non-reasoning model. The task is a
        // short structured synthesis, so it is faster and cheaper than using
        // the full reading model and does not spend the output allowance on
        // hidden reasoning tokens.
        model: process.env.DAILY_HOROSCOPE_MODEL || "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 450,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "daily_horoscope",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                urgency: {
                  type: "string",
                  enum: ["urgent", "important", "steady", "supportive"],
                },
                action: { type: "string" },
                boundary: { type: "string" },
                warning: { type: "string" },
                positive: { type: "string" },
              },
              required: ["urgency", "action", "boundary", "warning", "positive"],
            },
          },
        },
      }),
    });

    const payload = await openAIResponse.json() as OpenAIResponsePayload;
    if (!openAIResponse.ok) {
      throw new Error(payload.error?.message || "The horoscope service did not complete the request.");
    }

    if (payload.status === "incomplete") {
      throw new Error(
        `The horoscope response was incomplete${payload.incomplete_details?.reason ? `: ${payload.incomplete_details.reason}` : ""}.`
      );
    }

    const refusal = (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .find((content) => typeof content.refusal === "string")?.refusal;
    if (refusal) throw new Error("The horoscope request was refused by the model.");

    const raw = extractOutputText(payload);
    if (!raw) throw new Error("The horoscope service returned an empty response.");

    const result = parseDailyHoroscopeResponse(raw);
    return NextResponse.json({
      horoscope: formatDailyHoroscope(result),
      urgency: result.urgency,
      localDate: input.localDate,
    });
  } catch (error) {
    console.error("Daily horoscope generation failed", error);
    const message = error instanceof Error ? error.message : "Unknown horoscope error";
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production"
          ? "Today’s horoscope could not be prepared. Please try again."
          : `Today’s horoscope could not be prepared: ${message}`,
      },
      { status: 500 }
    );
  }
}
