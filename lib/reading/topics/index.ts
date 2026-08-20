import type { TopicConfig, TopicId } from "./types";
import { love } from "./love";
import { money } from "./money";
import { career } from "./career";
import { whatsComing } from "./whatsComing";

// The "What's Coming" button sends topic "general" (see intake screen),
// so the general slot points at the whatsComing config.
export const TOPICS: Record<TopicId, TopicConfig> = {
  love,
  money,
  career,
  general: whatsComing,
};

/** Resolve a topic string to its config. Unknown topics fall back to general —
 *  matching the old `|| instructions.general` / `default:` behavior exactly. */
export function getTopic(id: string | undefined): TopicConfig {
  return TOPICS[id as TopicId] ?? TOPICS.general;
}