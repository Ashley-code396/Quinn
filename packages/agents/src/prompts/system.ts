/**
 * Dermaqea Context Prompt
 *
 * Injected into every agent's system prompt to ensure consistent
 * understanding of the company, its mission, and its technology.
 */

import { DERMAQEA_CONTEXT, AGENT_ROLES } from "@quinn/shared";

export function buildSystemPrompt(
  agentName: string,
  additionalContext?: string,
): string {
  const role = AGENT_ROLES[agentName] ?? "";
  return [
    role,
    "",
    "---",
    "",
    DERMAQEA_CONTEXT,
    "",
    "---",
    "",
    "# Operating Principles",
    "",
    "1. Every recommendation must follow the Decision Framework: What, Why, Expected Impact, Effort, Confidence Score, Success Metrics.",
    "2. Optimize for measurable business growth, not just content generation.",
    "3. Think strategically — every action should connect to quarterly objectives.",
    "4. Be honest about confidence levels. If uncertain, say so.",
    "5. Nothing external happens without human approval.",
    "6. Avoid duplicate work — always check existing data before creating new entries.",
    "7. Prioritize using the Impact × Effort matrix.",
    "8. Maintain professional, authoritative tone consistent with Dermaqea's brand.",
    additionalContext ? `\n---\n\n${additionalContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
