/**
 * Nova — Content Marketing Agent
 *
 * Generates thought leadership content, maintains content calendar,
 * and ensures brand voice consistency.
 */

import { ChatGroq } from "@langchain/groq";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getContentItemsTool,
  createContentItemTool,
  createApprovalTool,
  logAgentActionTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";

const NOVA_CONTEXT = `
# Content Pillars
1. **Counterfeit Awareness** — Statistics, case studies, consumer risk
2. **Authentication Technology** — How invisible crypto works, comparisons
3. **Brand Trust** — Why authenticity matters for brand loyalty
4. **Industry Insights** — Skincare market trends, regulation changes
5. **Founder Journey** — Building in public, milestones, lessons

# Content Types to Generate
- LinkedIn posts (hook-driven, short paragraphs, data points, CTA, 3-5 hashtags)
- Blog articles (800-1500 words, SEO-optimized)
- Founder updates (personal, authentic, milestone-focused)
- Educational content (explainers, infographics, how-tos)
- Technical explainers (how the technology works)
- Whitepapers (in-depth industry analysis)
- Case studies (when available)
- Newsletter editions
- Product announcements
- Counterfeit awareness campaigns

# Rules
- Maintain consistent brand voice: professional, authoritative, innovative
- Never repeat previous content ideas — check existing content first
- Include specific data points and statistics where possible
- Every piece should tie back to Dermaqea's mission
- Generate content that builds thought leadership, not just fills a calendar
- Submit all content for approval before publishing
`;

export async function novaNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  const model = new ChatGroq({
     model: "llama-3.3-70b-versatile",
     temperature: 0.7,
   });

  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "generate content ideas";

  // Check existing content to avoid repetition
  const existingContent = await searchMemories({
    query: taskDescription,
    agentName: "NOVA",
    category: "content_context",
    limit: 5,
  });

  const memoryContext = existingContent.length > 0
    ? `\n# Previous Content (avoid repeating)\n${existingContent.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("nova", NOVA_CONTEXT + memoryContext);

  const modelWithTools = model.bindTools([
    getContentItemsTool,
    createContentItemTool,
    createApprovalTool,
    logAgentActionTool,
  ]);

  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ]);

  // Store content ideas in memory for deduplication
  if (response.content && typeof response.content === "string" && response.content.length > 50) {
    await storeMemory({
      agentName: "NOVA",
      category: "content_context",
      content: response.content.slice(0, 2000),
      importance: 0.5,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: response.content?.toString() ?? "Content generation cycle complete.",
        name: "nova",
      }),
    ],
    agentReports: [
      {
        agentName: "nova",
        summary: "Content marketing report",
        findings: [response.content?.toString()?.slice(0, 500) ?? "No content generated"],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
