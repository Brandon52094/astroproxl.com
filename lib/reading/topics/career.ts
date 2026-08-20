import type { TopicConfig } from "./types";

export const career: TopicConfig = {
  id: "career",
  label: "Career",
  // base (+ Uranus, Midheaven for career)
  relevantPlanets: new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Midheaven"]),
  relevantHouses: new Set([10, 6, 2]),
  relevantAspects: new Set(["conjunction", "square", "opposition"]),
  focusLine: "CAREER & PROFESSION — Focus on Saturn, Sun, Mars, 10th/6th/2nd houses",
  windowInstruction: [
    "CAREER READING — Focus on these transits:",
    "  - Saturn aspects (career structure, authority, long-term path)",
    "  - Sun aspects (identity, recognition, leadership)",
    "  - Mars aspects (action, ambition, drive)",
    "  - Jupiter aspects (expansion, opportunity, promotion)",
    "  - Uranus aspects (change, innovation, unexpected shifts)",
    "  - 10th House activations (vocation, public reputation, authority)",
    "  - 6th House activations (daily work, routines, service)",
    "  - 2nd House activations (income from work, value)",
    "",
    "WINDOW INTERPRETATION:",
    "  - Saturn trine Sun → career recognition, authority role",
    "  - Mars square Saturn → work pressure, ambition vs reality",
    "  - Jupiter sextile Sun → promotion, recognition, opportunity",
    "  - Uranus in 10th → career pivot, unexpected change",
    "",
    "🔴 AVOID: Reading romance or money transits as career signals.",
  ].join("\n"),
};