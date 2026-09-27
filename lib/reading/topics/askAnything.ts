import type { TopicConfig } from "./types";

export const askAnything: TopicConfig = {
  id: "ask-anything",
  label: "Ask Anything",

  // Premium/open-context reading:
  // don't prematurely filter out evidence before the engine
  // understands what the user is asking about.
  relevantPlanets: new Set([
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
    "Chiron",
    "North Node",
    "South Node",
    "Juno",
    "Lilith",
    "Vesta",
    "Pallas",
    "Ascendant",
    "Descendant",
    "Midheaven",
    "Imum Coeli",
  ]),

  relevantHouses: new Set([
    1, 2, 3, 4, 5, 6,
    7, 8, 9, 10, 11, 12,
  ]),

  relevantAspects: new Set([
    "conjunction",
    "opposition",
    "square",
    "trine",
    "sextile",
  ]),

  relevantAngles: new Set([
    "Ascendant",
    "Descendant",
    "Midheaven",
    "Imum Coeli",
  ]),

  focusLine:
    "ASK ANYTHING — Let the user's question determine the relevant life domains. Do not force the reading into a preset topic.",

  windowInstruction: [
    "ASK ANYTHING — OPEN CONTEXT PREMIUM READING",
    "",
    "The user's question determines the focus.",
    "Read the question first, then identify the life domains it actually involves.",
    "",
    "USE:",
    "  - The strongest relevant natal placements",
    "  - Current transit-to-natal aspects",
    "  - Relevant house activations",
    "  - Angular contacts",
    "  - Profection/time-lord evidence when relevant",
    "  - Progressions and other validated timing layers when supplied",
    "",
    "The question may involve more than one domain.",
    "For example, a move may involve home, money, career, and relationships.",
    "Do not discard relevant evidence simply because it belongs to another preset reading category.",
    "",
    "Lead with the strongest converging evidence.",
    "Use dates only when supported by the calculated timing data.",
    "",
    "🔴 DO NOT force the question into Love, Money, Career, or What's Coming.",
  ].join("\n"),

  // Optional premium-specific overrides later:
  // system: "...",
  // maxTokens: 5000,
};