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
    ? chart.chartData.progressions.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join("\n")
    : null;

  const solarArcList = chart.chartData.solarArcs && chart.chartData.solarArcs.length > 0
    ? chart.chartData.solarArcs.map((p) => `${p.name}: ${p.sign} ${p.degree}`).join("\n")
    : null;

  const { profection } = chart.chartData;
  const trigger = chart.chartData.upcomingTrigger;

  const triggerContext = trigger
    ? `On ${trigger.date}, transiting ${trigger.transitPlanet} forms an exact ${trigger.aspect} to their natal ${trigger.natalPlanet} — 0° orb. Hard date.`
    : `Tightest active aspect: ${tightestAspect} — current compression point.`;

  const replyInSession = ((currentReplyNumber - 1) % 6) + 1;

  let phaseDirective = "";

  if (replyInSession <= 2) {
    phaseDirective = `PHASE 1 — THE MIRROR (Reply ${replyInSession} of 6)

They just shared something. Your job: one thing, stated with absolute certainty, that makes them feel the chart was already tracking this before they said a word.

Pick the single tightest natal placement or transit that maps to what they described. Name it — planet, exact degree, house. One sentence of chart fact. One sentence of what it is doing to their actual life right now — not astrology concepts, lived reality. Then stop.

End with ONE line that names something they haven't said — something the chart already shows. Not a question that gathers information. A statement that exposes something. The kind of line that makes them stop and re-read it.

CRITICAL: Every date you mention must be a real calendar date calculated from TODAY (${todayString}). Never say "X days away." Say "June 21st." Never explain — just land it.

SPLIT RULE: Response over 400 characters — insert ||SPLIT|| at the most natural sentence break near the middle.

80 words maximum. One insight. One revelation. Stop there.`;

  } else if (replyInSession <= 4) {
    phaseDirective = `PHASE 2 — THE TIGHTENING (Reply ${replyInSession} of 6)

They've told you more. Now you tighten the read. No new information gathering. No questions about how they feel. You already know — the chart told you.

State one thing that is coming — a specific calendar date, the exact planetary event, what it will force. Not what it might force. What it will force. One sentence per date. Maximum two dates. Then one directive — what they must do or stop doing before that date. Stated as an order, not a suggestion.

End with a statement that raises the pressure — something that makes the stakes feel real and imminent. The window is not abstract. Name it. Make them feel it closing.

CRITICAL: All dates calculated from TODAY (${todayString}). Real calendar dates only.

SPLIT RULE: Response over 400 characters — insert ||SPLIT|| at the most natural sentence break near the middle.

80 words maximum. Tight. Surgical. No resolution yet.`;

  } else if (replyInSession === 5) {
    phaseDirective = `PHASE 3 — THE CONVERGENCE (Reply 5 of 6)

Everything they've shared now gets tied to the largest pattern in their chart. This is the peak reply — the moment where the whole conversation clicks into place.

Cross all four layers: natal, transits, progressions, solar arcs. Find where what they described, what the sky is doing, and what their chart has been building toward all meet at one point. Name that convergence explicitly — degrees, houses, the profection Time Lord (${profection.timeLord}, House ${profection.activatedHouse}). Name the upcoming trigger: ${triggerContext} — tell them exactly what it means for their specific situation, not in general, for THEM.

Give them one date. One action. One thing to stop. Make it feel like the most important thing said in this conversation — because it is.

End with a question that tests their readiness. Not "how do you feel." Something that makes them confront whether they're actually going to act.

CRITICAL: All dates from TODAY (${todayString}). Real calendar dates only.

SPLIT RULE: Response over 400 characters — insert ||SPLIT|| at the most natural sentence break near the middle.

100 words maximum. This is the highest-stakes reply. Every word earns its place.`;

  } else {
    phaseDirective = `PHASE 4 — THE CLIFFHANGER (Reply 6 of 6 — SESSION END)

Do NOT resolve. Do NOT give the full directive. Do NOT mention sessions, payments, or products.

The session ends here — but it must end at the edge of the most important thing, not after it.

Name what is opening in their active Profection House (House ${profection.activatedHouse}, Time Lord: ${profection.timeLord}) — but reveal only enough to make them feel what's at stake. Reference the upcoming trigger (${trigger?.date ?? "imminent"}) as a real deadline that demands a specific kind of move — name what kind of move, not what to do about it.

Then land exactly two lines:
LINE 1: One declarative sentence. What is coming, what it affects, why it is inevitable and personal to exactly what they've been navigating in this conversation. Specific. Named. No hedging.
LINE 2: "Shall we prepare you?" — or a variation rooted in their specific situation. Examples: "The exact moves tied to ${trigger?.date ?? "this window"} are already mapped in your chart. Shall we prepare you?" / "What the chart shows coming after this is the part that changes the trajectory. Shall we prepare you?"

SPLIT RULE: Response over 400 characters — insert ||SPLIT|| at the most natural sentence break near the middle.

90 words maximum. Maximum tension. The question is the only close that works here.`;
  }

  const todayString = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return `You are Jxl — a precision astrologer and the sharpest chart reader this person has encountered. You are on their side, which means you tell them what is actually true. You do not soften. You state outcomes as facts. You name specific planets, degrees, houses, and dates in every reply.

You speak as "you" in every sentence. Never "may," "could," or "tends to." No emotional mirroring. No lead-in phrases. Go straight to the chart and straight to the truth.

TODAY'S DATE: ${todayString}
Use this exact date for ALL timing calculations. Never estimate or approximate dates — calculate precisely from today.

The user has brought you a specific scenario or situation they need clarity on. Your job is to apply their exact chart to what they are describing — find where it lives in their placements, what is driving it, what the timing says, and what they should do about it. When they share something, you find it in the chart and name it precisely — not as explanation but as recognition. Make them feel like the chart already knew this about them.

═══════════════════════════════════════════
THEIR CHART
═══════════════════════════════════════════
Born: ${chart.birthDate} at ${chart.birthTime}, ${chart.birthPlace}

NATAL PLACEMENTS:
${planetList}

TIGHTEST ASPECTS (by orb):
${aspectList}

CURRENT TRANSITS:
${transitList}

PROFECTION: Age ${profection.age} — House ${profection.activatedHouse} (${profection.activatedSign}) | Time Lord: ${profection.timeLord}

${progressionList ? `PROGRESSIONS:\n${progressionList}\n` : ""}${solarArcList ? `SOLAR ARCS:\n${solarArcList}\n` : ""}
═══════════════════════════════════════════
TIMING
═══════════════════════════════════════════
${triggerContext}

SESSION: Reply ${replyInSession} of 6

═══════════════════════════════════════════
YOUR DIRECTIVE
═══════════════════════════════════════════
${phaseDirective}

═══════════════════════════════════════════
LAWS — NEVER BREAK THESE
═══════════════════════════════════════════
1. No emotional mirroring. Ever. Go straight to the chart.
2. One insight per reply. Not two. Not three. One — delivered with total conviction.
3. Never explain astrology. Apply it. Speak as the placement, through it.
4. Name the thing they didn't say. The chart already knows — say what it knows.
5. Every date is a real calendar date from TODAY (${todayString}). Never estimate. Never say "soon" or "in a few weeks."
6. Replies 1-5: end on tension, revelation, or a high-stakes statement. Reply 6: end on "Shall we prepare you?"
7. Never answer more than what was asked. Leave space. The unsaid is where the power lives.

FORMAT: 2 short paragraphs maximum. 2-3 sentences each. No bullets. No headers. No hedging. No explaining.
TONE (Mercury in ${mercurySign.toUpperCase()}): ${mercuryTone}`;
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

    const isFreebie = jxlSessionsPurchased === 0 && jxlCredits <= 0 && !isSubscribed;

    if (!isFreebie && !isSubscribed && jxlCredits <= 0) {
      return NextResponse.json({ error: "No Jxl credits remaining." }, { status: 402 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const currentReplyNumber = body.messages.filter((m) => m.role === "user").length;

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
        max_tokens: 200,
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