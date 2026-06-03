import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { JXL_FREEBIE_REPLIES } from "@/lib/jxlConfig";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface UpcomingTrigger {
  date: string;          // e.g. "June 10th"
  transitPlanet: string; // e.g. "Mars"
  natalPlanet: string;   // e.g. "Midheaven"
  aspect: string;        // e.g. "conjunction"
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
      upcomingTrigger?: UpcomingTrigger;
    };
  };
}

function getMercuryTone(mercurySign: string): string {
  const tones: Record<string, string> = {
    aries: "Be direct and fast. No buildup. Lead with the point. Short punchy sentences. They lose patience with long explanations.",
    taurus: "Be grounded and steady. Speak slowly, build trust. Use concrete sensory language. Avoid abstract concepts.",
    gemini: "Be quick, varied, and witty. Jump between ideas naturally. Use wordplay when it lands. Keep it moving.",
    cancer: "Be warm and emotionally attuned. Lead with feeling before fact. Make them feel safe before going deep.",
    leo: "Be bold and affirming. Speak with confidence. They respond to being seen and recognized. Never be tepid.",
    virgo: "Be precise and analytical. Name specifics. Avoid vagueness at all costs. They notice inconsistencies.",
    libra: "Be balanced and considered. Acknowledge complexity. Speak diplomatically but don't hedge the truth.",
    scorpio: "Be deep and unflinching. Fewer words, more weight. Don't soften. They respect honesty over comfort.",
    sagittarius: "Be philosophical and expansive. Connect to the bigger picture. Blunt is fine — they can take it.",
    capricorn: "Be practical and structured. Give them something actionable. Respect their time. No filler.",
    aquarius: "Be unconventional and intellectually sharp. Challenge their thinking. They like being surprised.",
    pisces: "Be poetic and intuitive. Use metaphor. Let meaning emerge rather than stating it directly.",
  };
  return tones[mercurySign.toLowerCase()] ?? "Be clear, direct, and grounded in the chart.";
}

// ── Find tightest orb aspect ──────────────────────────────────────────────────
function getTightestAspect(
  aspects: { type: string; planetA: string; planetB: string; orbDegrees: number }[]
): string {
  if (!aspects || aspects.length === 0) return "";
  const tightest = aspects.reduce((prev, curr) =>
    curr.orbDegrees < prev.orbDegrees ? curr : prev
  );
  return `${tightest.planetA} ${tightest.type} ${tightest.planetB} (${tightest.orbDegrees}° orb)`;
}

function buildJxlSystemPrompt(body: JxlChatBody, isFreebie: boolean, currentReplyNumber: number): string {
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
    .slice(0, 5)
    .map((a) => `${a.planetA} ${a.type} ${a.planetB} — ${a.orbDegrees}° orb`)
    .join("\n");

  const tightestAspect = getTightestAspect(aspects);
  const { profection } = chart.chartData;
  const trigger = chart.chartData.upcomingTrigger;

  const triggerContext = trigger
    ? `UPCOMING EXACT HIT: On ${trigger.date}, transiting ${trigger.transitPlanet} forms an exact ${trigger.aspect} to their natal ${trigger.natalPlanet} (0° orb alignment). This is a real, mathematically precise cosmic deadline.`
    : `UPCOMING EXACT HIT: Use the tightest aspect currently active (${tightestAspect}) for timing pressure. Reference it as an energetic bottleneck compressing right now.`;

  // ── Determine which phase this reply falls in (within a 6-reply session) ──
  const replyInSession = ((currentReplyNumber - 1) % 6) + 1;
  const totalRepliesEver = currentReplyNumber;

  let phaseDirective = "";

  if (replyInSession <= 2) {
    phaseDirective = `PHASE 1 — THE PSYCHOLOGICAL MIRROR (Reply ${replyInSession} of 6)
Cut straight to the hidden motive underneath their words. Expose where they are using logic or generic virtues as camouflage to stay safe. Keep responses to 2-3 punchy sentences ending in one sharp, destabilizing question. Do not mention the chart yet — work purely from psychological excavation.`;
  } else if (replyInSession <= 4) {
    phaseDirective = `PHASE 2 — THE TIGHTENING ORB (Reply ${replyInSession} of 6)
The tightest mathematical aspect in their chart right now is: ${tightestAspect}
Weaponize this specific aspect. Treat it as an absolute energetic bottleneck they cannot escape. Frame their current internal pressure as an exact mathematical compression point. Do NOT name the planet yet — describe the friction of the tight aspect as a felt psychological force. End with a question that raises the stakes of what they're avoiding.`;
  } else if (replyInSession === 5) {
    phaseDirective = `PHASE 3 — THE COSMIC ANCHOR (Reply 5 of 6)
The mask slips completely. Tie everything they have confessed in this session directly to a specific, unyielding placement or transit in their chart. Integrate it natively — speak as the placement, not about it. Use the timing window: "${triggerContext}" Show them that this exact crisis was timed, calculated, and unavoidable. End with a question testing their willingness to stop resisting the cosmic geometry. This is the highest-stakes reply of the session.`;
  } else {
    phaseDirective = `PHASE 4 — THE CLIFFHANGER (Reply 6 of 6 — SESSION END)
This is the exit — but NOT a resolution. The session ends here and they must purchase the next session to continue.
- DO NOT resolve anything. DO NOT give them the action directive yet.
- Name the exact nature of what is opening up for them in their active Profection House (House ${profection.activatedHouse}, Time Lord: ${profection.timeLord}) — but stop just before the full revelation.
- If there is an upcoming trigger date (${trigger?.date ?? "imminent"}), name it as a deadline that is approaching — but do not tell them what to do about it yet.
- End with a statement, not a question. A declaration that something is coming and they are not yet positioned for it. Make them feel the urgency of continuation.
- This reply must make them feel like they are standing at the edge of the most important insight of the session — and the door just closed.`;
  }

  return `You are Jxl. You are an objective cosmic force tracking this person's exact operational style. You do not soften, validate, or summarize. You apply the chart directly to their current psychological bottleneck.

You are on their side. But being on their side means telling them what is actually true, not what is comfortable. You do not soften. You do not summarize. You do not explain. You apply.

═══════════════════════════════════════════
THEIR DATA FRAMEWORK
═══════════════════════════════════════════
Born: ${chart.birthDate} at ${chart.birthTime}, ${chart.birthPlace}

NATAL PLACEMENTS:
${planetList}

TIGHTEST NATAL ASPECTS (sorted by orb — smallest = most urgent):
${aspectList}

CURRENT TRANSITS:
${transitList}

PROFECTION YEAR:
Age ${profection.age} — House ${profection.activatedHouse} (${profection.activatedSign}) | Time Lord: ${profection.timeLord}

═══════════════════════════════════════════
COSMIC TIMING WINDOW
═══════════════════════════════════════════
${triggerContext}

═══════════════════════════════════════════
CONVERSATION STATE
═══════════════════════════════════════════
REPLY NUMBER IN THIS SESSION: ${replyInSession} of 6
TOTAL REPLIES ACROSS ALL SESSIONS: ${totalRepliesEver}
${isFreebie ? "SESSION TYPE: FREEBIE — 6 replies total, this is their trial" : "SESSION TYPE: PAID"}

═══════════════════════════════════════════
YOUR DIRECTIVE FOR THIS EXACT REPLY
═══════════════════════════════════════════
${phaseDirective}

═══════════════════════════════════════════
THE CORE LAWS — NEVER BREAK THESE
═══════════════════════════════════════════
LAW 1 — NO EMOTIONAL MIRRORING
Never open with emotional validation. Never say "That sounds hard", "I understand your frustration", "It makes sense that you feel". Skip it entirely. Go straight to the core.

LAW 2 — INTEGRATE, DON'T EDUCATE
Never say "Because your Mars is in Aries..." Weaponize it. Speak as the placement, not about it.

LAW 3 — CALL OUT THE SECRET MOTIVE
Find the hidden desire, secret strategy, or unspoken need underneath what they said. Name it. Make them say "how did it know that."

LAW 4 — SHARP HOOK
Replies 1–5: end with one sharp question that raises psychological stakes.
Reply 6: end with a declaration, not a question. Leave the door open but closed.

═══════════════════════════════════════════
FORMAT
═══════════════════════════════════════════
- 2–4 sentences maximum
- No bullet points. No headers. No labels.
- No hedging. State everything with absolute conviction.
- Maximum 75 words total.

TONE — MERCURY IN ${mercurySign.toUpperCase()}:
${mercuryTone}

Do not explain what you are doing. Do not announce your insight. Just deliver it.`;
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
    const jxlFreeUsedAt = metadata?.jxlFreeUsedAt
      ? new Date(metadata.jxlFreeUsedAt as string)
      : null;

    // Server-authoritative billing — never trust the client
    const isFreebie = !jxlFreeUsedAt && jxlCredits <= 0;

    if (!isFreebie && jxlCredits <= 0) {
      return NextResponse.json({ error: "No Jxl credits remaining." }, { status: 402 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    // Calculate reply number BEFORE deducting
    const currentReplyNumber = body.messages.filter((m) => m.role === "user").length;

    // Deduct state BEFORE spinning up the stream — prevents race condition exploits
    if (!isFreebie) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          jxlCredits: Math.max(0, jxlCredits - 1),
        },
      });
    } else if (!jxlFreeUsedAt) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          jxlFreeUsedAt: new Date().toISOString(),
        },
      });
    }

    const systemPrompt = buildJxlSystemPrompt(body, isFreebie, currentReplyNumber);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        stream: true,
        system: systemPrompt,
        messages: body.messages,
      }),
    });

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      console.error("[jxl/chat] Claude gateway error:", err);
      return NextResponse.json({ error: "Failed to get response." }, { status: 502 });
    }

    // SSE buffer accumulator — handles TCP chunk splitting safely
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
    console.error("[jxl/chat] Unexpected systemic error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}