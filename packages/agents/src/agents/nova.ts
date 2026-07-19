/**
 * Nova — Content Marketing Agent
 *
 * Generates thought leadership content, maintains content calendar,
 * and ensures brand voice consistency.
 */

import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getContentItemsTool,
  createContentItemTool,
  createApprovalTool,
  logAgentActionTool,
  searchWebTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const NOVA_CONTEXT = `
# Content Pillars
1. **Counterfeit Awareness** — Statistics, case studies, consumer risk
2. **Authentication Technology** — How invisible cryptographic signatures works, comparisons
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
    limit: 8,
  });

  const memoryContext = existingContent.length > 0
    ? `\n# Relevant Knowledge & Previous Content\n${existingContent.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("nova", NOVA_CONTEXT + memoryContext);

  const modelWithTools = model.bindTools([
    searchWebTool,
    getContentItemsTool,
    createContentItemTool,
    createApprovalTool,
    logAgentActionTool,
  ]);

  const novaMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(novaMessages) !== "human") {
    novaMessages.push(new HumanMessage("Proceed with content generation using the context above."));
  }
  let response = await modelWithTools.invoke(novaMessages);

  const novaTools = [searchWebTool, getContentItemsTool, createContentItemTool, createApprovalTool, logAgentActionTool];

  if (response.tool_calls?.length && !response.content?.toString().trim()) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = novaTools.find(t => t.name === tc.name);
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      }
    }
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nSummarize your content findings based on these results.`
    );
    response = await model.invoke([...novaMessages, response, followUp]);
  }

  const novaContent = response.content?.toString()?.trim() || "Content generation cycle complete.";

  if (novaContent.length > 50) {
    await storeMemory({
      agentName: "NOVA",
      category: "content_context",
      content: novaContent.slice(0, 2000),
      importance: 0.5,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: novaContent,
        name: "nova",
      }),
    ],
    agentReports: [
      {
        agentName: "nova",
        summary: "Content marketing report",
        findings: [novaContent.slice(0, 500)],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
