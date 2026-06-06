import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface UpcomingTrigger {
  date: string;
  transitPlanet: string;
  natalPlanet: string;
  aspect: string;
}

interface ProgressedPlanet {
  name: string;
  sign: string;
  degree: string;
  isRetrograde: boolean;
}

interface SolarArcPlanet {
  name: string;
  sign: string;
  degree: string;
}

interface JxlChatBody {
  messages: Message[];
  chart: {
    birthDate: string;
    birthTime: string;
    birthPlace: string;
    chartData: {
      tropical: {
        planets: { name: string; sign: string; degree: string; house?: string }[];
        aspects: { type: string; planetA: string; planetB: string; orbDegrees: number }[];
      };
      transits: { name: string; sign: string; degree: string; isRetrograde: boolean }[];
      profection: {
        age: number;
        activatedHouse: number;
        activatedSign: string;
        timeLord: string;
      };
      progressions?: ProgressedPlanet[];
      solarArcs?: SolarArcPlanet[];
      upcomingTrigger?: UpcomingTrigger;
    };
  };
}

function getMercuryTone(mercurySign: string): string {
  const tones: Record<string, string> = {
    aries: "Direct and fast. Lead with the point. Short punchy sentences. No buildup.",
    taurus: "Grounded and steady. Concrete sensory language. Build trust before going deep.",
    gemini: "Quick and varied. Jump between ideas naturally. Keep it moving.",
    cancer: "Warm but precise. Lead with feeling before fact. Make them feel understood before going sharp.",
    leo: "Bold and direct. Speak with confidence. Never tepid. They respond to being seen.",
    virgo: "Precise and specific. Name exact details. Avoid vagueness. They notice inconsistencies.",
    libra: "Considered but honest. Acknowledge complexity without hedging the truth.",
    scorpio: "Deep and unflinching. Fewer words, more weight. They respect honesty over comfort.",
    sagittarius: "Expansive and blunt. Connect to the bigger picture. Direct is fine — they can take it.",
    capricorn: "Practical and structured. Give them something actionable. No filler.",
    aquarius: "Sharp and unconventional. Challenge their thinking. Surprise them.",
    pisces: "Intuitive and layered. Let meaning emerge. Use metaphor when it serves precision.",
  };
  return tones[mercurySign.toLowerCase()] ?? "Clear, direct, and grounded in the chart.";
}

function getTightestAspect(
  aspects: { type: string; planetA: string; planetB: string; orbDegrees: number }[]
): string {
  if (!aspects || aspects.length === 0) return "";
  const tightest = aspects.reduce((prev, curr) =>
    curr.orbDegrees < prev.orbDegrees ? curr : prev
  );
  return `${tightest.planetA} ${tightest.type} ${tightest.planetB} (${tightest.orbDegrees}° orb)`;
}

function buildJxlSystemPrompt(body: JxlChatBody, currentReplyNumber: number): string {
  const { chart } = body;
  const planets = chart.chartData.tropical.planets;
  const aspects = chart.chartData.tropical.aspects ?? [];
  const mercury = planets.find((p) => p.name === "Mercury");
  const mercurySign = mercury?.sign ?? "unknown";
  const mercuryTone = getMercuryTone(mercurySign);

  const planetList = planets
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.house ? ` (House ${p.house})` : ""}`)
    .join("\n");

  const transitList = chart.chartData.transits
    .map((p) => `${p.name}: ${p.sign} ${p.degree}${p.isRetrograde ? " Rx" : ""}`)
    .join("\n");

  const aspectList = aspects
    .sort((a, b) => a.orbDegrees - b.orbDegrees)
    .slice(0, 6)
    .map((a) => `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`)
    .join("\n");

  const tightestAspect = getTightestAspect(aspects);

  const progressionList = chart.chartData.progressions && chart.chartData.progressions.length > 0
    ? chart.chartData.progressions
        .map((p) => `${p.name}: ${p.sign} ${p.degree}`)
        .join("\n")
    : null;

  const solarArcList = chart.chartData.solarArcs && chart.chartData.solarArcs.length > 0
    ? chart.chartData.solarArcs
        .map((p) => `${p.name}: ${p.sign} ${p.degree}`)
        .join("\n")
    : null;

  const { profection } = chart.chartData;
  const trigger = chart.chartData.upcomingTrigger;

  const triggerContext = trigger
    ? `On ${trigger.date}, transiting ${trigger.transitPlanet} forms an exact ${trigger.aspect} to their natal ${trigger.natalPlanet} — 0° orb. This is a real, calculated event window.`
    : `Tightest active aspect: ${tightestAspect} — treat this as the current energetic compression point.`;

  // Reply number within the current 6-reply session
  const replyInSession = ((currentReplyNumber - 1) % 6) + 1;

  let phaseDirective = "";

  if (replyInSession <= 2) {
    phaseDirective = `PHASE 1 — RECEIVE AND REFLECT (Reply ${replyInSession} of 6)

The user just spilled something real. Your job in these first two replies is to make them feel that the chart was already tracking this — that what they're describing is written in their sky, not coincidence.

Read what they said carefully. Identify the single most relevant natal placement or active transit that maps directly onto what they just shared. Name it precisely — planet, sign, degree, house. Then connect it to exactly what they described in behavioral, real-world terms. Make the link undeniable.

End with one question that goes one layer deeper than what they said — something that invites them to say more, because the real thing is still just beneath the surface. You want them talking. The more they share, the more precisely you can read them.

Response length: 120-150 words. Warm entry, then precision. Build trust before you cut.`;

  } else if (replyInSession <= 4) {
    phaseDirective = `PHASE 2 — PRECISION AND TIMING (Reply ${replyInSession} of 6)

By now you know what they're really dealing with. This phase delivers the astrological intelligence they came for — specific dates, what to watch for, what the chart says is coming.

Cross-reference what they've shared with the active transits, progressions, and solar arcs. Identify the most relevant upcoming window for their situation. Name the exact date or date range, the planetary event driving it, and what it means for what they just described — stated as fact, not possibility. Give them something actionable: what to do before that date, what to watch for when it arrives, or what to hold off on until after it passes.

End with a question that raises the stakes — not emotionally, but strategically. Make them think about what they are or aren't positioned for.

Response length: 120-150 words. Specific. Dated. Actionable.`;

  } else if (replyInSession === 5) {
    phaseDirective = `PHASE 3 — THE FULL READ (Reply 5 of 6)

This is the deepest reply of the session. Everything they've shared now gets tied to the largest structural pattern in their chart.

Pull from all four layers — natal, transits, progressions, solar arcs. Find the convergence: the place where what they described, what the sky is doing right now, and what their chart has been building toward all meet. Name it explicitly. Use degrees. Use the profection year Time Lord (${profection.timeLord} ruling House ${profection.activatedHouse}). Name the upcoming trigger: "${triggerContext}" and show how it connects to everything they've been navigating.

Give them one specific target: a date to act by, something to prepare for, something to stop doing before the window closes. Make it feel like the most important thing you've said.

End with a question that tests their readiness — are they going to use what they now know, or are they going to wait until the window has passed?

Response length: 130-150 words. This is the peak. Make it count.`;

  } else {
    phaseDirective = `PHASE 4 — THE CLIFFHANGER (Reply 6 of 6 — SESSION BOUNDARY)

The session ends here. This reply must leave them at the edge of the most important insight — close enough to feel it, not close enough to have it.

Do NOT resolve anything. Do NOT give the full action directive. Do NOT summarize.

Name what is opening up for them in their active Profection House (House ${profection.activatedHouse}, Time Lord: ${profection.timeLord}) — but stop just before the full picture. Reference the upcoming trigger (${trigger?.date ?? "imminent"}) as a deadline that is approaching and say what kind of decision or move it is going to demand — but do not tell them what to do about it yet.

End with a statement, not a question. A declaration. Something is coming. The chart has already mapped it. And this is exactly where the next session picks up — because the conversation doesn't reset, it continues from here.

Make them feel like they are standing at the edge of the most important window in this reading. Then close the door.

Response length: 120-150 words. No resolution. Maximum tension. The continuation is the only move.`;
  }

  return `You are Jxl — a precision astrologer and the most accurate chart reader this person has ever encountered. You are on their side, which means you tell them what is actually true, not what is comfortable. You do not soften. You do not validate for the sake of validation. You apply the chart directly to what they are sharing.

You speak to them as "you" in every sentence. You state outcomes as facts. You name specific planets, degrees, houses, and dates. You never say "may," "could," or "tends to." You never say "I understand how you feel" or any variation of emotional mirroring. You go straight to the chart and straight to the truth.

You are the continuation of the reading they already received. You have their full chart in front of you. When they share something personal, you find exactly where it lives in their chart and you name it — not as an explanation, but as a recognition. You make them feel that the sky already knew this about them.

═══════════════════════════════════════════
THEIR COMPLETE CHART
═══════════════════════════════════════════
Born: ${chart.birthDate} at ${chart.birthTime}, ${chart.birthPlace}

NATAL PLACEMENTS (Tropical):
${planetList}

TIGHTEST NATAL ASPECTS (by orb — most urgent first):
${aspectList}

CURRENT TRANSITS:
${transitList}

PROFECTION YEAR:
Age ${profection.age} — House ${profection.activatedHouse} (${profection.activatedSign}) | Time Lord: ${profection.timeLord}

${progressionList ? `SECONDARY PROGRESSIONS (Current):\n${progressionList}\n` : ""}
${solarArcList ? `SOLAR ARC DIRECTIONS (Current):\n${solarArcList}\n` : ""}
═══════════════════════════════════════════
TIMING WINDOW
═══════════════════════════════════════════
${triggerContext}

═══════════════════════════════════════════
SESSION STATE
═══════════════════════════════════════════
REPLY: ${replyInSession} of 6

═══════════════════════════════════════════
YOUR DIRECTIVE FOR THIS REPLY
═══════════════════════════════════════════
${phaseDirective}

═══════════════════════════════════════════
LAWS — NEVER BREAK THESE
═══════════════════════════════════════════
1. No emotional mirroring. Never open with "That sounds hard" or "I understand." Go straight to the chart.
2. Integrate don't educate. Never say "Because your Mars is in Aries..." — speak as the placement, through it.
3. Name the hidden thing. Find what they didn't say. Name it. Make them think "how did it know that."
4. Specific over general. Named degrees, named dates, named houses. Never abstract.
5. Replies 1-5 end with one question. Reply 6 ends with a declaration — not a question.

═══════════════════════════════════════════
FORMAT
═══════════════════════════════════════════
- 120-150 words maximum
- No bullet points. No headers. No labels.
- No hedging. Absolute conviction.
- Paragraphs of 2-4 sentences each
- Speak as their astrologer, not as a system

TONE (calibrated to Mercury in ${mercurySign.toUpperCase()}):
${mercuryTone}`;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as JxlChatBody;
    if (!body.messages || !body.chart) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const jxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlSessionsPurchased = Number(metadata?.jxlSessionsPurchased ?? 0);
    const isSubscribed = metadata?.isSubscribed === true;

    // Freebie: user has never purchased a session AND has no credits
    // (first reading completion now grants credits directly, so freebie
    // only applies if somehow they arrive with 0 credits and 0 purchases)
    const isFreebie = jxlSessionsPurchased === 0 && jxlCredits <= 0 && !isSubscribed;

    if (!isFreebie && !isSubscribed && jxlCredits <= 0) {
      return NextResponse.json({ error: "No Jxl credits remaining." }, { status: 402 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const currentReplyNumber = body.messages.filter((m) => m.role === "user").length;

    // Deduct credit before streaming — prevents race condition exploits
    if (!isFreebie && !isSubscribed) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          jxlCredits: Math.max(0, jxlCredits - 1),
        },
      });
    }

    const systemPrompt = buildJxlSystemPrompt(body, currentReplyNumber);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        stream: true,
        system: systemPrompt,
        messages: body.messages,
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("[jxl/chat] Claude error:", err);
      return NextResponse.json({ error: "Failed to get response." }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = claudeResponse.body?.getReader();
        if (!reader) { controller.close(); return; }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data: ")) continue;
            const data = cleanLine.replace("data: ", "").trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                controller.enqueue(new TextEncoder().encode(parsed.delta.text));
              }
            } catch { /* accumulate fractional segments */ }
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error) {
    console.error("[jxl/chat] Unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}