import type { TopicConfig } from "./types";

export const whatsComing: TopicConfig = {
  id: "general",
  label: "What's Coming",
  // base only — no topic narrowing
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]),
  relevantHouses: new Set([1, 4, 7, 10]),
  relevantAspects: new Set(["conjunction", "opposition", "square", "trine", "sextile"]),
  focusLine: "GENERAL — No topic filter, use all significant transits",
  windowInstruction: [
    "GENERAL READING — Focus on significant transits:",
    "  - All personal planet transits",
    "  - Angular house activations (1, 4, 7, 10)",
    "  - Slow planet transits (structural shifts)",
    "  - Fast planet transits (immediate moments)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Lead with the SPINE aspect",
    "  - Mix structural and immediate windows",
    "  - Include one long-term theme and one immediate action",
    "",
    "🔴 No topic filter applied — use all significant transits.",
  ].join("\n"),
};