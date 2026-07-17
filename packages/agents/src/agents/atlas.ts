/**
 * Atlas — Growth & Business Development Agent
 *
 * Discovers and evaluates growth opportunities: partnerships,
 * grants, accelerators, conferences, pilot customers.
 */
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getOpportunitiesTool,
  searchOrganizationsTool,
  createApprovalTool,
  logAgentActionTool,
  searchWebTool,
  extractWebContentTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const ATLAS_CONTEXT = `
# Opportunity Categories
1. **Enterprise Prospects** — Large skincare brands that could be pilot customers
2. **Pilot Customers** — Small-medium brands willing to trial Dermaqea
3. **Strategic Partners** — Packaging companies, technology partners
4. **Investors** — Angels, VCs focused on beauty-tech or supply chain
5. **Accelerators** — Beauty-tech, anti-counterfeit, or general startup programs
6. **Grants** — Innovation, consumer safety, sustainability grants
7. **Conferences** — Beauty expos, packaging conferences, anti-counterfeit summits
8. **Competitions** — Startup pitch competitions, innovation awards

# Evaluation Framework
Score every opportunity on:
- Strategic Fit (1-10): How well does this align with Dermaqea's mission?
- Revenue Potential (1-10): What's the revenue upside?
- Brand Value (1-10): Will this enhance Dermaqea's reputation?
- Effort Required (LOW/MEDIUM/HIGH): How much work to pursue?
- Probability of Success (0-100%): Realistic assessment

# Rules
- Recommend a prioritized list, not just a dump of opportunities
- Flag time-sensitive opportunities (deadlines, application windows)
- Consider Dermaqea's current stage — we're pre-revenue, so capital-efficient opportunities come first
- Every recommendation should connect to quarterly goals
`;

export async function atlasNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  const model = new ChatGroq({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
     temperature: 0.3,
   });
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "find growth opportunities";

  const relevantMemories = await searchMemories({
    query: taskDescription,
    agentName: "ATLAS",
    limit: 5,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Previous Opportunity Research\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("atlas", ATLAS_CONTEXT + memoryContext);

  const modelWithTools = model.bindTools([
    searchWebTool,
    extractWebContentTool,
    getOpportunitiesTool,
    searchOrganizationsTool,
    createApprovalTool,
    logAgentActionTool,
  ]);

  const atlasMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(atlasMessages) !== "human") {
    atlasMessages.push(new HumanMessage("Proceed with growth opportunity analysis."));
  }
  let response = await modelWithTools.invoke(atlasMessages);

  const atlasTools = [searchWebTool, extractWebContentTool, getOpportunitiesTool, searchOrganizationsTool, createApprovalTool, logAgentActionTool];

  if (response.tool_calls?.length && !response.content?.toString().trim()) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = atlasTools.find(t => t.name === tc.name);
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      }
    }
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nSummarize your growth analysis findings based on these results.`
    );
    response = await model.invoke([...atlasMessages, response, followUp]);
  }

  const atlasContent = response.content?.toString()?.trim() || "Growth analysis complete with opportunity evaluation.";

  if (atlasContent.length > 50) {
    await storeMemory({
      agentName: "ATLAS",
      category: "opportunities",
      content: atlasContent.slice(0, 2000),
      importance: 0.6,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: atlasContent,
        name: "atlas",
      }),
    ],
    agentReports: [
      {
        agentName: "atlas",
        summary: "Growth & business development report",
        findings: [atlasContent.slice(0, 500)],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
