import type { TopicConfig } from "./types";

export const love: TopicConfig = {
  id: "love",
  label: "Love",
  // base = Sun,Moon,Mercury,Venus,Mars,Jupiter,Saturn (+ North Node, Juno, Lilith for love)
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "North Node", "Juno", "Lilith"]),
  relevantHouses: new Set([5, 7, 8]),
  relevantAspects: new Set(["conjunction", "trine", "sextile"]),
  focusLine: "LOVE & RELATIONSHIPS — Focus on Venus, Mars, Moon, 5th/7th/8th houses",
  windowInstruction: [
    "LOVE READING — Focus on these transits:",
    "  - Venus aspects (love, attraction, values)",
    "  - Mars aspects (passion, drive, action)",
    "  - Moon aspects (emotions, nurturing, receptivity)",
    "  - Juno aspects (commitment, partnership, the marriage question)",
    "  - Lilith aspects (raw attraction, desire, what's untamed)",
    "  - 5th House activations (romance, pleasure, creativity)",
    "  - 7th House activations (partnerships, commitments)",
    "  - 8th House activations (intimacy, shared resources, depth)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Venus trine Mars → magnetic attraction, chemistry",
    "  - Venus square Saturn → relationship tests, commitment fears",
    "  - Moon conjunct Venus → emotional bonding, nurturing love",
    "  - Mars in 5th → bold romantic gestures, passion",
    "  - Juno conjunct/square a personal planet → a commitment reaching a decision point",
    "  - Lilith trine Venus/Mars → magnetic, uninhibited attraction surfacing",
    "",
    "🔴 AVOID: Reading money or career transits as love signals.",
  ].join("\n"),
};