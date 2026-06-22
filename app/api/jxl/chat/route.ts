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

// Sister sign map — opposite sign in the zodiac wheel
const SISTER_SIGNS: Record<string, string> = {
  aries: "libra", libra: "aries",
  taurus: "scorpio", scorpio: "taurus",
  gemini: "sagittarius", sagittarius: "gemini",
  cancer: "capricorn", capricorn: "cancer",
  leo: "aquarius", aquarius: "leo",
  virgo: "pisces", pisces: "virgo",
};

function getMoonSisterTone(moonSign: string): string {
  const sisterSign = SISTER_SIGNS[moonSign.toLowerCase()] ?? moonSign.toLowerCase();

  const tones: Record<string, { rhythm: string; trigger: string; forbidden: string }> = {
    aries: {
      rhythm: "Direct, rapid, and combative. Lead with the core conclusion. Short, heavy, declarative sentences.",
      trigger: "Challenge their impulse control. Frame reality as an immediate wall they must either break through or crash into.",
      forbidden: "Never use tentative build-ups, academic preambles, or soft, comforting validations. Strip all fluff."
    },
    taurus: {
      rhythm: "Grounded, unhurried, and dense. Use concrete, heavy sensory language and material-world concepts.",
      trigger: "Target their stubborn resistance to change. Contrast temporary comfort against long-term stagnation.",
      forbidden: "Never use hyperactive concept-jumping or purely abstract, ungrounded esoteric spiritualizing."
    },
    gemini: {
      rhythm: "Quick, dualistic, and varied. Shift angles rapidly. Use sharp, intellectual contrasts and dialectical tension.",
      trigger: "Expose their over-intellectualization loop. Call out how they use analysis to escape taking actual physical action.",
      forbidden: "Never deliver a singular, heavy, monotonous wall of prose. Keep the rhythm kinetic and multi-faceted."
    },
    cancer: {
      rhythm: "Precise but intimate. Quiet, heavy authority. Use language that addresses localized roots and protective armor.",
      trigger: "Pierce the defensive shell directly. Address the hidden emotional weight they are currently hyper-protecting.",
      forbidden: "Never use cold, purely robotic engineering terminology. The tone must feel like a quiet, inescapable truth."
    },
    leo: {
      rhythm: "Bold, absolute, and commanding. Speak with unwavering structural authority. Use high-stakes, dramatic framings.",
      trigger: "Target their core identity and sovereignty. Frame the current bottleneck as a compromise of their actual stature.",
      forbidden: "Never speak with passive, tepid, or secondary-status language. Do not diminish the scale of the diagnostic."
    },
    virgo: {
      rhythm: "Surgical, hyper-specific, and analytical. Name exact degrees, houses, and precise behavioral mechanics.",
      trigger: "Weaponize their obsession with error. Show them the mathematical inevitability of their current self-sabotage loop.",
      forbidden: "Never use vague generalizations, hand-waving predictions, or unquantifiable mystical metaphors."
    },
    libra: {
      rhythm: "Measured, objective, and clear. Structural symmetry. Present truths as unyielding geometric balances.",
      trigger: "Confront their paralyzing hesitation. Strip away their polite justifications and force them to look at the raw discrepancy.",
      forbidden: "Never pick a side out of bias; state the structural verdict so cleanly that there is no room to negotiate."
    },
    scorpio: {
      rhythm: "Deep, intense, and heavily compressed. Fewer words, massive psychological weight. Pure unfiltered exposure.",
      trigger: "Unearth the hidden power dynamic, taboo truth, or survival mechanism they are actively keeping in the dark.",
      forbidden: "Never use superficial reassurances, generic positive affirmations, or polite, corporate-softened language."
    },
    sagittarius: {
      rhythm: "Expansive, blunt, and unhedged. Large-scale structural framing. Direct, perspective-shifting delivery.",
      trigger: "Confront their ideological denial. Call out where they are running from real-world details in search of a broad fantasy.",
      forbidden: "Never deliver tedious micro-step instructions or defensive, risk-averse, hyper-cautious warnings."
    },
    capricorn: {
      rhythm: "Practical, cold, and heavily structured. Architectural reality. Focus entirely on material load-bearing capacity.",
      trigger: "Audit their operational overhead. Expose where they are building on soft ground or tolerating structurally broken dynamics.",
      forbidden: "Never offer emotional coddling or vague, un-executable spiritual advice. It must be a tactical reality check."
    },
    aquarius: {
      rhythm: "Sharp, clinical, and completely unconventional. Detached overview. Present facts from a high, objective distance.",
      trigger: "Deconstruct their rationalizations. Challenge their need to feel detached or different from the actual messy friction.",
      forbidden: "Never use traditional, copy-paste horoscopic phrases or standard emotional-validation frameworks."
    },
    pisces: {
      rhythm: "Intuitive, layered, and deep. Use precise structural metaphors that track the underlying porous, dissolving currents.",
      trigger: "Dissolve their illusions. Force them to confront exactly where they are drifting to avoid a hard reality threshold.",
      forbidden: "Never use rigid, superficial checklist language that ignores the underlying psychological matrix."
    }
  };

  const profile = tones[sisterSign];
  if (!profile) return "Clear, direct, surgical, and entirely grounded in the mechanical facts of the chart.";

  return "DELIVERY RHYTHM: " + profile.rhythm + "\nPSYCHOLOGICAL TRIGGER: " + profile.trigger + "\nFORBIDDEN: " + profile.forbidden;
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

  const todayString = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const planets = chart.chartData.tropical.planets;
  const aspects = chart.chartData.tropical.aspects ?? [];
  const moon = planets.find((p) => p.name === "Moon");
  const moonSign = moon?.sign ?? "unknown";
  const mercuryTone = getMoonSisterTone(moonSign);

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

  if (replyInSession === 1) {
    phaseDirective = `REPLY 1 — THE MIRROR
Address what they just shared by going straight to the tightest active transit or natal placement that maps onto it. Name the planet, degree, house. One sentence of chart fact. One sentence of what it is doing to their actual lived reality right now. End with one unsolicited observation — something they didn't mention but the chart already shows. State it as fact. Make them re-read it.
End with a question that opens the next layer — not generic, rooted in what the chart is pointing toward.
TODAY: ${todayString}. Bold every date.`;

  } else if (replyInSession === 2) {
    phaseDirective = `REPLY 2 — THE INVESTIGATION
They've responded. Now go deeper into what their answer reveals in the chart. Target the unmentioned pattern — the natal loop running beneath the surface. Name the specific placement driving it. State what it does behaviorally in plain language — not astrological concepts, their actual real-world behavior.
End with one sharp binary question rooted in a named natal placement. Two options — both of which are true. No neutral exit. The question should feel like a verification, not a therapy prompt.
TODAY: ${todayString}. Bold every date.`;

  } else if (replyInSession === 3) {
    phaseDirective = `REPLY 3 — THE UNMASKING
Use their answer to name the core pattern precisely. No solutions yet. No dates yet. Just the loop — how this natal placement creates it, what they keep doing as a result. One brutal plain truth about what they are doing right now that is working against them. Not what the planets are doing. What THEY are doing.
End with the implication that the chart has already mapped when this breaks — but don't name the date yet. Leave it open.
TODAY: ${todayString}. Bold every date.`;

  } else if (replyInSession === 4) {
    phaseDirective = `REPLY 4 — THE DATE
Drop the exact calendar date where this hits its breaking point — calculated precisely from TODAY (${todayString}). Name the planetary event. State what will happen mechanically on that date as fact. Name what is at stake for their specific situation.
Withhold the solution completely. End with a statement that makes clear the move is already visible in the chart — but do not name it yet.
Bold the date. Bold every date mentioned.`;

  } else if (replyInSession === 5) {
    phaseDirective = `REPLY 5 — THE CONVERGENCE
Pull everything together — natal, transits, progressions, solar arcs. Show where they all intersect at the same point. Name the profection Time Lord (${profection.timeLord}, House ${profection.activatedHouse}) and what it means for this specific window. Reference the upcoming trigger — ${triggerContext}.
Frame it as convergence, not doom. Everything has been building toward this. The window is specific and real. End with a statement that makes clear the blueprint exists — but hold the final reveal for Reply 6.
Bold every date.`;

  } else {
    phaseDirective = `REPLY 6 — THE CLOSE
The blueprint exists. State what is at stake if they navigate this window correctly — specific, personal, inevitable. No product language. No mention of sessions or payments.
End on: "The exact moves are already mapped. Shall we prepare you?" — or a variation rooted in their specific situation.
This is the lifeline, not the sales pitch. Make it feel like both.
Bold every date.`;
  }

  return `You are Jxl — a precision astrologer with no filter. You are this person's personal astrologer. You know their chart completely and you speak to them directly, without softening, without hedging, without generic language.

You use the exact current positions of the planets combined with their complete birth chart — natal placements, current transits, progressions, and solar arc directions — to deliver direct, specific, and accurate insight. You state outcomes. You use specific dates. You never offer probabilities. You do not censor or soften. You speak to them as "you" in every sentence. Make your delivery compatible with their chart.

TODAY'S DATE: ${todayString}
Use this exact date for ALL timing calculations. Real calendar dates only. Never estimate.

BOLD DATES: Every specific calendar date in your response must be wrapped in **bold** markdown. Example: **June 27, 2026**.

Your job is to apply their exact chart to what they are describing. Find where it lives in their placements, what is driving it, what the timing says. When they share something, find it in the chart and name it precisely — not as explanation but as recognition. Make them feel like the chart already knew this about them before they opened the app.

Give just enough. Not everything. Leave space. The unsaid is where the pull lives.

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
PHASE GUIDE — Reply ${replyInSession} of 6
═══════════════════════════════════════════
${phaseDirective}

═══════════════════════════════════════════
LAWS — NEVER BREAK THESE
═══════════════════════════════════════════
1. Go straight to the chart. No warmup. No emotional mirroring.
2. One core insight per reply — delivered with total conviction.
3. Never explain astrology. Apply it. Name the placement, name what it does.
4. State outcomes as facts. Never "may," "could," or "tends to."
5. Bold every specific calendar date: **Month Day, Year**.
6. Give just enough — leave them needing the next reply.
7. End each reply with either an open question that demands an answer, or a statement so precise it creates urgency. Reply 6 ends with "Shall we prepare you?"
8. One reply only. No splitting. No bubbles. One great response.

FORMAT: 1-2 paragraphs. Short, heavy sentences. No bullets. No headers. No hedging.
TONE (Moon in ${moonSign.toUpperCase()} — sister sign ${(SISTER_SIGNS[moonSign.toLowerCase()] ?? moonSign).toUpperCase()}): ${mercuryTone}`;
}

export async function POST(request: NextRequest) {
  // JXL is paused — remove this early return to re-enable.
  return NextResponse.json({ error: "JXL is currently unavailable." }, { status: 503 });

  /* eslint-disable no-unreachable */
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
if (!userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata;

    const jxlCredits = Number(metadata?.jxlCredits ?? 0);
    const jxlSessionsPurchased = Number(metadata?.jxlSessionsPurchased ?? 0);
    const isSubscribed = metadata?.isSubscribed === true;
    const jxlUnlimited = metadata?.jxlUnlimited === true;
    const jxlFreeUsedAt = metadata?.jxlFreeUsedAt as string | undefined;

    const isFreebie = jxlSessionsPurchased === 0 && jxlCredits <= 0 && !isSubscribed && !jxlUnlimited && !jxlFreeUsedAt;

    if (!isFreebie && !isSubscribed && !jxlUnlimited && jxlCredits <= 0) {
      return NextResponse.json({ error: "No Jxl credits remaining." }, { status: 402 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API configuration error." }, { status: 500 });
    }

    const currentReplyNumber = body.messages.filter((m) => m.role === "user").length;

    if (!isFreebie && !isSubscribed && !jxlUnlimited) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          jxlCredits: Math.max(0, jxlCredits - 1),
        },
      });
    }

    if (isFreebie && currentReplyNumber >= 6 && !jxlFreeUsedAt) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: {
          ...metadata,
          jxlFreeUsedAt: new Date().toISOString(),
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
        max_tokens: 600,
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