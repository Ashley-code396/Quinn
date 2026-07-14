/**
 * Sage — Research Intelligence Agent
 *
 * Continuously discovers opportunities by researching companies,
 * competitors, conferences, grants, and industry trends.
 */

import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  searchOrganizationsTool,
  upsertOrganizationTool,
  logAgentActionTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";

const SAGE_CONTEXT = `
# Research Priorities
Research the following categories for Dermaqea:
- Skincare brands (premium, mass-market, K-beauty, clean beauty)
- Cosmetic manufacturers and contract manufacturers
- Pharmaceutical companies with dermatology lines
- Beauty retailers (Sephora, Ulta, etc.) and e-commerce platforms
- Distributors in high-counterfeit regions
- Packaging companies specializing in beauty/cosmetics
- Recent counterfeit incidents in beauty/skincare
- Beauty conferences, trade shows, expos
- Startup accelerators relevant to beauty-tech or anti-counterfeit
- Grants for innovation, sustainability, or consumer safety
- Investors focused on beauty-tech, supply chain, or authentication
- Competitors in the authentication/anti-counterfeit space

# Profile Structure
For each organization discovered, capture:
- Company name, Website, Country, Industry
- Products, Company size
- Decision makers (name, title, contact)
- LinkedIn URL, Recent news
- Why Dermaqea is relevant to them
- Partnership potential assessment
- Priority score (1-10)
- Tags for categorization

# Rules
- Always check for duplicates before creating new profiles.
- Provide specific, actionable intelligence — not generic information.
- Score organizations based on strategic fit with Dermaqea.
- Flag high-priority opportunities for Quinn's attention.
`;

export async function sageNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  const model = new ChatGroq({
     model: "llama-3.3-70b-versatile",
     temperature: 0.4,
   });

  // Retrieve memories relevant to current research task
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "research opportunities for Dermaqea";
  
  const relevantMemories = await searchMemories({
    query: taskDescription,
    agentName: "SAGE",
    limit: 5,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Previous Research\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("sage", SAGE_CONTEXT + memoryContext);

  const modelWithTools = model.bindTools([
    searchOrganizationsTool,
    upsertOrganizationTool,
    logAgentActionTool,
  ]);

  // Run Sage's research cycle
  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5), // Keep context manageable
  ]);

  // Store key findings in memory
  if (response.content && typeof response.content === "string" && response.content.length > 50) {
    await storeMemory({
      agentName: "SAGE",
      category: "research",
      content: response.content.slice(0, 2000),
      importance: 0.6,
    }).catch(() => {}); // Non-critical
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: response.content?.toString() ?? "Research cycle complete. No new findings at this time.",
        name: "sage",
      }),
    ],
    agentReports: [
      {
        agentName: "sage",
        summary: "Research intelligence report",
        findings: [response.content?.toString()?.slice(0, 500) ?? "No findings"],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
