export type TopicId = "love" | "money" | "career" | "general";

export interface TopicConfig {
  id: TopicId;
  label: string;

  // ── the filters lifted verbatim out of the old switch statements ──
  relevantPlanets: Set<string>;
  relevantHouses: Set<number>;
  relevantAspects: Set<string>;
  focusLine: string;         // was topicFocusMap[topic]
  windowInstruction: string; // was getTopicWindowInstruction(topic)

  // ── optional per-topic overrides (UNSET = current behavior) ──
  // Fill these in when you start perfecting each reading independently.
  system?: string;
  temperature?: number;
  maxTokens?: number;
}