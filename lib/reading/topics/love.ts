import type { TopicConfig } from "./types";

export const love: TopicConfig = {
  id: "love",
  label: "Love",
  // base = Sun,Moon,Mercury,Venus,Mars,Jupiter,Saturn (+ North Node for love)
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "North Node"]),
  relevantHouses: new Set([5, 7, 8]),
  relevantAspects: new Set(["conjunction", "trine", "sextile"]),
  focusLine: "LOVE & RELATIONSHIPS — Focus on Venus, Mars, Moon, 5th/7th/8th houses",
  windowInstruction: [
    "LOVE READING — Focus on these transits:",
    "  - Venus aspects (love, attraction, values)",
    "  - Mars aspects (passion, drive, action)",
    "  - Moon aspects (emotions, nurturing, receptivity)",
    "  - 5th House activations (romance, pleasure, creativity)",
    "  - 7th House activations (partnerships, commitments)",
    "  - 8th House activations (intimacy, shared resources, depth)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Venus trine Mars → magnetic attraction, chemistry",
    "  - Venus square Saturn → relationship tests, commitment fears",
    "  - Moon conjunct Venus → emotional bonding, nurturing love",
    "  - Mars in 5th → bold romantic gestures, passion",
    "",
    "🔴 AVOID: Reading money or career transits as love signals.",
  ].join("\n"),
};