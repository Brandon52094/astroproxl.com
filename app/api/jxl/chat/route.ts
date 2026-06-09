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
    phaseDirective = `PHASE 1 — RECEIVE AND REFLECT (Reply ${replyInSession} of 6)

They just shared something real. Your job is to make them feel like the chart already knew.

Find the single most relevant natal placement or active transit that maps exactly onto what they described. Name it precisely — planet, degree, house. Then tell them what it is doing to their life right now in concrete behavioral terms. Not astrology concepts — actual lived experience. Then name one specific upcoming date calculated precisely from TODAY'S DATE above — state the exact planetary event and what it means for their situation on that day. Never say a date is "X days away" — always name the actual calendar date.

End with one statement that reveals something they didn't say — something the chart shows that they haven't named yet. Make them think "how did it know that." If you ask a question, make it one that exposes something, not one that gathers information.

SPLIT RULE: If your response exceeds 400 characters, insert the exact text ||SPLIT|| at the most natural sentence break near the middle. This creates two messages. Do not add any explanation around the split marker.

100 words maximum. No textbook astrology explanations. No life coach questions. Precision only.`;

  } else if (replyInSession <= 4) {
    phaseDirective = `PHASE 2 — PRECISION AND TIMING (Reply ${replyInSession} of 6)

By now you know what they're actually dealing with. Deliver the astrological intelligence — no warmup, no questions for information gathering.

Name two specific calendar dates calculated precisely from TODAY'S DATE. For each: one sentence naming the exact planetary event with degree, and one sentence naming the specific consequence for their situation stated as absolute fact. Never hedge. Never say "may" or "could." Then one sharp directive — what they must do or stop doing before the first date arrives.

End with a statement that raises the stakes — something that makes them realize the window they're in is more significant than they thought. Not a question. A declaration.

SPLIT RULE: If your response exceeds 400 characters, insert the exact text ||SPLIT|| at the most natural sentence break near the middle. This creates two messages. Do not add any explanation around the split marker.

100 words maximum. Every date is a real calendar date. No approximations.`;

  } else if (replyInSession === 5) {
    phaseDirective = `PHASE 3 — THE FULL READ (Reply 5 of 6)

This is the peak. Pull from all four layers — natal, transits, progressions, solar arcs. Find where everything they've shared converges in the chart. Name the profection year Time Lord (${profection.timeLord}, House ${profection.activatedHouse}) and show how it connects to their situation. Name the upcoming trigger: "${triggerContext}" and tell them exactly what it means for their next move.

Give them one specific date to act by and one thing to stop doing before it arrives.

End with a question testing their readiness — will they use this window or let it pass?

SPLIT RULE: If your response exceeds 400 characters, insert the exact text ||SPLIT|| at the most natural sentence break near the middle. This creates two messages. Do not add any explanation around the split marker.

110 words maximum. This is the highest-stakes reply. Make every word count.`;

  } else {
    phaseDirective = `PHASE 4 — THE CLIFFHANGER (Reply 6 of 6 — SESSION BOUNDARY)

Do NOT resolve anything. Do NOT give the action directive. Do NOT mention sessions, purchases, or anything product-related.

Name what is opening in their Profection House (House ${profection.activatedHouse}, Time Lord: ${profection.timeLord}) — but stop just before the full picture. Reference the upcoming trigger (${trigger?.date ?? "imminent"}) as a deadline approaching. Name what kind of move or decision it will demand — but do not tell them what to do about it yet.

Then end with exactly two lines:
1. One declarative sentence that names the specific stakes — what is coming, what it affects, why it matters now. Make it feel inevitable and personal to their situation.
2. A direct question that offers to prepare them — always ending with "Shall we prepare you?" or a close natural variation. The question must be rooted in the specific context of what they shared in this conversation — not generic. Examples: "There are three moves tied to specific dates before ${trigger?.date ?? "the window closes"}. Shall we prepare you?" / "What comes after this landing is the part that changes the trajectory. Shall we prepare you?" / "The exact dates and what they demand are already mapped. Shall we prepare you?"

SPLIT RULE: If your response exceeds 400 characters, insert the exact text ||SPLIT|| at the most natural sentence break near the middle. This creates two messages. Do not add any explanation around the split marker.

100 words maximum. Maximum tension. No resolution. The question is the close.`;
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
LAWS
═══════════════════════════════════════════
1. No emotional mirroring. Go straight to the chart.
2. Speak through the placement, not about it.
3. Name the thing they didn't say. Make them think "how did it know that."
4. Named degrees, named dates, named houses. Always.
5. Replies 1-5 end with one question. Reply 6 ends with a declaration.

FORMAT: 3 short paragraphs, 2-3 sentences each. No bullets. No headers. No hedging.
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