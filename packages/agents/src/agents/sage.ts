/**
 * Sage — Research Intelligence Agent
 *
 * Continuously discovers opportunities by researching companies,
 * competitors, conferences, grants, and industry trends.
 */

import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  searchOrganizationsTool,
  upsertOrganizationTool,
  logAgentActionTool,
  searchWebTool,
  extractWebContentTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const SAGE_CONTEXT = `
# Research Priorities
Research the following categories for Dermaqea:
- Dermaqea website (dermaqea.vercel.app) — reference our public-facing copy in research reports
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
  // Retrieve memories relevant to current research task
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "research opportunities for Dermaqea";
  
  const relevantMemories = await searchMemories({
    query: taskDescription,
    limit: 8,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relevant Knowledge & History\n${relevantMemories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("sage", SAGE_CONTEXT + memoryContext);

  const sageTools = [searchWebTool, extractWebContentTool, searchOrganizationsTool, upsertOrganizationTool, logAgentActionTool];

  const sageMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(sageMessages) !== "human") {
    sageMessages.push(new HumanMessage("Proceed with research using the context above."));
  }

  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(sageTools);
      return await modelWithTools.invoke(sageMessages);
    },
    { temperature: 0.4 },
  );

  if (response.tool_calls?.length) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = sageTools.find(t => t.name === tc.name);
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      }
    }
    const existingContent = response.content?.toString()?.trim() || "Tools executed.";
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nYour previous message: ${existingContent.slice(0, 1000)}\n\nSummarize your research findings based on these results.`
    );
    response = await withFallback(
      async (model) => model.invoke([...sageMessages, response, followUp]),
      { temperature: 0.4 },
    );
  }

  const sageContent = response.content?.toString()?.trim() || "Research cycle complete. No new findings at this time.";

  if (sageContent.length > 50) {
    await storeMemory({
      agentName: "SAGE",
      category: "research",
      content: sageContent.slice(0, 2000),
      importance: 0.6,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: sageContent,
        name: "sage",
      }),
    ],
    agentReports: [
      {
        agentName: "sage",
        summary: "Research intelligence report",
        findings: [sageContent],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
