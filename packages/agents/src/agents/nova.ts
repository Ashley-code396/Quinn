/**
 * Nova — Content Marketing Agent
 *
 * Generates thought leadership content, maintains content calendar,
 * and ensures brand voice consistency.
 */

import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getContentItemsTool,
  createContentItemTool,
  createApprovalTool,
  logAgentActionTool,
  searchWebTool,
  getLinkedInAnalyticsTool,
  generateVideoTool,
  generateImageTool,
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
- Short AI-generated videos (product demos, explainers, social clips) — use generate_video
- AI-generated images (carousel slides, thumbnails, social visuals) — use generate_image

# Daily Content Generation
When asked to generate daily content:
- Generate 1 LinkedIn post for today (use get_linkedin_analytics to see what performed well recently)
- Check the content calendar for upcoming slots
- Vary content pillars day-to-day — don't repeat the same topic twice in a row
- Create the post as a content item, then submit it for approval via create_approval
- Ensure there's always content ready for each day of the week

# LinkedIn Post Structure
Every LinkedIn post MUST include:
- A strong hook in the first 2 lines
- 3-5 short paragraphs (max 2 sentences each)
- 1 data point or statistic
- A clear CTA (question, link, or engagement prompt)
- 3-5 relevant hashtags
- Keep total length under 1500 characters

# Rules
- Maintain consistent brand voice: professional, authoritative, innovative
- Never repeat previous content ideas — check existing content first
- Include specific data points and statistics where possible
- Every piece should tie back to Dermaqea's mission
- When drafting content about Dermaqea, first call extract_web_content("https://dermaqea.vercel.app") to reference our actual public messaging
- Generate content that builds thought leadership, not just fills a calendar
- Submit all content for approval before publishing
- Generate at least one piece of content per day when running daily generation
- **Your report MUST include the full drafted post content** — paste the complete LinkedIn post (hook, body, CTA, hashtags) in your response. Do NOT just say "we drafted a post" — show the actual post text so it can be reviewed and approved immediately.
`;

export async function novaNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {

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

  const novaTools = [searchWebTool, getContentItemsTool, createContentItemTool, createApprovalTool, logAgentActionTool, getLinkedInAnalyticsTool, generateVideoTool, generateImageTool];


  const novaMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(novaMessages) !== "human") {
    novaMessages.push(new HumanMessage("Proceed with content generation using the context above."));
  }
  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(novaTools);
      return await modelWithTools.invoke(novaMessages);
    },
    { temperature: 0.7 },
  );


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
    response = await withFallback(
      async (model) => model.invoke([...novaMessages, response, followUp]),
      { temperature: 0.7 },
    );
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
        findings: [novaContent],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}

