import type { TopicConfig } from "./types";

export const money: TopicConfig = {
  id: "money",
  label: "Money",
  // base (+ Pluto for money)
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Pluto", "Vesta"]),
  relevantHouses: new Set([2, 8, 11]),
  relevantAspects: new Set(["conjunction", "trine", "square"]),
  focusLine: "MONEY & FINANCES — Focus on Venus, Jupiter, Saturn, 2nd/8th/11th houses",
  windowInstruction: [
    "MONEY READING — Focus on these transits:",
    "  - Venus aspects (money, values, resources)",
    "  - Jupiter aspects (expansion, abundance, opportunity)",
    "  - Saturn aspects (structure, discipline, long-term wealth)",
    "  - Pluto aspects (transformation, power, shared resources)",
    "  - 2nd House activations (income, personal assets)",
    "  - 8th House activations (shared resources, debt, investments)",
    "  - 11th House activations (gains, networks, financial opportunities)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Jupiter trine Venus → financial expansion, windfall",
    "  - Saturn square Venus → financial constraints, budgeting required",
    "  - Pluto sextile Venus → financial transformation, investment opportunity",
    "  - Venus in 2nd → income increase, value recognition",
    "",
    "🔴 AVOID: Reading romance or career transits as money signals.",
  ].join("\n"),
};