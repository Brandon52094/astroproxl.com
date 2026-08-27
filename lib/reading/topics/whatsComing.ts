import type { TopicConfig } from "./types";

export const whatsComing: TopicConfig = {
  id: "general",
  label: "What's Coming",
  // base + Chiron for the general/what's-coming read
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Chiron"]),
  relevantHouses: new Set([1, 4, 7, 10]),
  relevantAspects: new Set(["conjunction", "opposition", "square", "trine", "sextile"]),
  focusLine: "GENERAL — No topic filter, use all significant transits",
  windowInstruction: [
    "GENERAL READING — Focus on significant transits:",
    "  - All personal planet transits",
    "  - Angular house activations (1, 4, 7, 10)",
    "  - Slow planet transits (structural shifts)",
    "  - Fast planet transits (immediate moments)",
    "  - Chiron aspects (an old wound surfacing to be worked with, not around)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Lead with the SPINE aspect",
    "  - Let the strongest evidence determine whether the reading is immediate, structural, or both",
"  - Do not force short-term and long-term windows for variety",
    "  - Include one long-term theme and one immediate action",
    "  - Chiron conjunct a personal planet → a tender spot activated; growth through it",
    "",
    "🔴 No topic filter applied — use all significant transits.",
  ].join("\n"),
};