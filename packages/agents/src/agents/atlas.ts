/**
 * Atlas — Growth & Business Development Agent
 *
 * Discovers and evaluates growth opportunities: partnerships,
 * grants, accelerators, conferences, pilot customers.
 */
import { createModel, withFallback } from "../llm.js";
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

# Proactive Opportunity Hunting
Every time you are asked to find opportunities, you MUST:
1. Search the web for current open grant programs in consumer safety, supply chain, anti-counterfeit, or beauty-tech
2. Research upcoming beauty industry conferences (Cosmoprof, In-Cosmetics, etc.)
3. Identify 3-5 specific companies that would benefit from Dermaqea's technology
4. Check for accelerators currently accepting applications
5. Look for recent news about counterfeit incidents in skincare — these are warm leads
6. Score and rank everything you find

If no obvious opportunities exist in your database or web search, report that clearly and explain what types of opportunities would be worth pursuing. Do NOT return empty results — suggest specific next steps.

# Proactive Opportunity Actions
When you find a time-sensitive opportunity (grant deadline, conference application window, accelerator intake), you MUST:
1. Create an approval request via 'create_approval' with type GRANT_APPLICATION, CONFERENCE_REGISTRATION, or PARTNERSHIP_PROPOSAL
2. Include the full details: name, URL, deadline, effort required, and why Dermaqea should apply
3. This creates a clickable approval button in Telegram so the user can say "apply" with one tap

# Rules
- Recommend a prioritized list, not just a dump of opportunities
- Flag time-sensitive opportunities (deadlines, application windows)
- Consider Dermaqea's current stage — we're pre-revenue, so capital-efficient opportunities come first
- Every recommendation should connect to quarterly goals
- If asked specifically about an opportunity type (e.g., "grants" or "conferences"), focus on that category
- **Every opportunity MUST include a direct URL/link** — grants need the application page, conferences need the event page, organizations need their website, etc. Do NOT describe an opportunity without providing its link.
- **Call 'create_approval' for every actionable opportunity** — do not just list opportunities in your report. If it has a deadline and a URL, create an approval so the user can act immediately.
`;

export async function atlasNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "find growth opportunities";

  const relevantMemories = await searchMemories({
    query: taskDescription,
    limit: 8,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relevant Knowledge & History\n${relevantMemories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("atlas", ATLAS_CONTEXT + memoryContext);

  const atlasTools = [searchWebTool, extractWebContentTool, getOpportunitiesTool, searchOrganizationsTool, createApprovalTool, logAgentActionTool];

  const atlasMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(atlasMessages) !== "human") {
    atlasMessages.push(new HumanMessage("Proceed with growth opportunity analysis."));
  }
  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(atlasTools);
      return await modelWithTools.invoke(atlasMessages);
    },
    { temperature: 0.3 },
  );

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
    response = await withFallback(
      async (model) => model.invoke([...atlasMessages, response, followUp]),
      { temperature: 0.3 },
    );
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
        findings: [atlasContent],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
