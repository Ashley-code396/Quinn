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
import { prisma } from "@quinn/database";
import {
  getContentItemsTool,
  createContentItemTool,
  createApprovalTool,
  getPendingApprovalsTool,
  logAgentActionTool,
  searchWebTool,
  getLinkedInAnalyticsTool,
  generateVideoTool,
  generateImageTool,
  generatePdfTool,
  generateSlidesTool,
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
- **Whitepapers (PDF)** — use generate_pdf for in-depth industry analysis reports
- **One-pagers (PDF)** — use generate_pdf for concise company/product overviews
- **Brochures (PDF)** — use generate_pdf with structured sections
- **Case studies (PDF)** — use generate_pdf when data is available
- Newsletter editions
- Product announcements
- Counterfeit awareness campaigns
- Short AI-generated videos (product demos, explainers, social clips) — use generate_video
- AI-generated images (carousel slides, thumbnails, social visuals) — use generate_image
- **Pitch decks (PPTX)** — use generate_slides for investor/partner presentations
- **Proposal decks (PPTX)** — use generate_slides for partnership proposals
- **Conference presentations (PPTX)** — use generate_slides for speaking engagements

# Daily Content Generation
When asked to generate daily content:
- Generate 1 LinkedIn post for today (use get_linkedin_analytics to see what performed well recently)
- Check the content calendar for upcoming slots
- Vary content pillars day-to-day — don't repeat the same topic twice in a row
- Generate a matching image or short video using generate_image / generate_video to accompany each post
- Submit the post and media for approval via create_approval — never publish directly
- Ensure there's always content ready for each day of the week

# LinkedIn Posts
- **Minimum length: 1800 characters** (LinkedIn algorithm favors longer posts). Maximum: 3000 characters.
- Structure: strong hook (first 2 lines) → 3-5 substantive paragraphs with specific data/insights → 1 data point or statistic → clear CTA → 3-5 hashtags
- Each paragraph must be at least 2-3 sentences. Do not write one-liner paragraphs.
- Every post must include at least one specific statistic, data point, or research finding — not just generic claims.
- **CRITICAL: Generate FULL-length posts, not summaries.** A 200-character blurb is unacceptable. Write complete, publication-ready content.
- **Media**: For every LinkedIn post, use generate_image to create a custom visual (carousel slide, infographic, or social graphic). Include the generated image URL in the approval content. You can also use generate_video for short video content.

# Rules
- Maintain consistent brand voice: professional, authoritative, innovative
- Never repeat previous content ideas — check existing content first
- Include specific data points and statistics where possible
- Every piece should tie back to Dermaqea's mission
- When drafting content about Dermaqea, first call extract_web_content("https://dermaqea.vercel.app") to reference our actual public messaging
- Generate content that builds thought leadership, not just fills a calendar
- Generate at least one piece of content per day when running daily generation
- **You MUST use your tools to take real actions** — do not just write text. For every piece of content you generate:
  1. Call 'create_content_item' to save the post to the content calendar
  2. Call 'create_approval' with type LINKEDIN_POST or BLOG_POST to submit it for human approval
  3. Only after calling both tools, include the full post text in your response
- **Proactive content generation**: Even without being explicitly asked, generate content when there are gaps in the calendar or when trending topics match our pillars. Use 'search_web' to find timely hooks, then create the content and submit for approval.

# Reporting Mode (Questions about what was done)
- If the CEO asks a QUESTION about the current state — e.g. "Did you post on LinkedIn today?", "What content is scheduled?", "Any pending approvals?" — you are in REPORTING MODE.
- REPORTING MODE means: use your tools to CHECK the actual state and answer the question. Do NOT write or generate new content.
- For "did we post on LinkedIn today?": call get_content_items (filter by status, check publishedAt), get_linkedin_analytics (recent posts), and get_pending_approvals. Report exactly what you find: posted at this time + URL, draft pending approval, or nothing yet today.
- For "what needs my approval?": call get_pending_approvals and list each item with title, priority, and reasoning.
- Answer conversationally and honestly, like a real marketing manager would. Never fabricate a post that does not exist.
`;

export async function novaNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {

  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "generate content ideas";

  // Check existing content to avoid repetition
  const existingContent = await (async () => {
    try {
      return await searchMemories({
        query: taskDescription,
        limit: 8,
      });
    } catch (e) {
      console.warn("Memory search failed, continuing without it:", (e as Error).message);
      return [];
    }
  })();

  const memoryContext = existingContent.length > 0
    ? `\n# Relevant Knowledge & Previous Content\n${existingContent.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("nova", NOVA_CONTEXT + memoryContext);

  const novaTools = [searchWebTool, getContentItemsTool, createContentItemTool, createApprovalTool, getPendingApprovalsTool, logAgentActionTool, getLinkedInAnalyticsTool, generateVideoTool, generateImageTool, generatePdfTool, generateSlidesTool];


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


  if (response.tool_calls?.length) {
    const toolResults: string[] = [];
    let createdContentItemId: string | null = null;
    let createdApprovalId: string | null = null;
    for (const tc of response.tool_calls) {
      const tool = novaTools.find(t => t.name === tc.name);
      if (!tool) continue;
      try {
        const result = await (tool as any).invoke(tc.args);
        if (tc.name === "create_content_item") {
          try { createdContentItemId = (JSON.parse(result) as { id?: string })?.id ?? null; } catch { /* not JSON */ }
        } else if (tc.name === "create_approval") {
          try { createdApprovalId = (JSON.parse(result) as { id?: string })?.id ?? null; } catch { /* not JSON */ }
        }
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      } catch (err) {
        toolResults.push(`${tc.name} failed: ${(err as Error).message}`);
      }
    }
    // Keep content items in sync with their approval: when Nova creates both a
    // content item and an approval, link them so the executor can advance the
    // content item's status (IDEA -> APPROVED -> PUBLISHED) on approval.
    if (createdContentItemId && createdApprovalId) {
      try {
        const itemExists = await prisma.contentItem.findUnique({
          where: { id: createdContentItemId },
          select: { id: true },
        });
        if (itemExists) {
          await prisma.approval.update({
            where: { id: createdApprovalId },
            data: { contentItemId: createdContentItemId },
          });
        }
      } catch (e) {
        console.warn("Could not link approval to content item:", (e as Error).message);
      }
    }
    const existingContent = response.content?.toString()?.trim() || "Tools executed.";
    const followUp = new HumanMessage(
      `You called tools and got these results:\n\n${toolResults.join("\n\n")}\n\nYour previous message was: ${existingContent.slice(0, 1000)}\n\nNow summarize what you created and submitted for approval.`
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

