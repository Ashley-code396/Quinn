/**
 * Iris — Relationship Management Agent
 *
 * Maintains long-term professional relationships, tracks follow-ups,
 * and ensures no relationship goes cold.
 */

import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getFollowUpsDueTool,
  searchOrganizationsTool,
  createApprovalTool,
  logAgentActionTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const IRIS_CONTEXT = `
# Relationship Management Priorities
1. Track all contacts, organizations, and interaction history
2. Monitor follow-up dates and flag overdue follow-ups
3. Assess relationship health based on interaction frequency and quality
4. Recommend next actions for each relationship
5. Draft follow-up messages when needed (submit for approval)

# Relationship Health Rules
- **Hot** (interacted within 7 days): Active engagement
- **Warm** (interacted within 30 days): Maintain momentum
- **Cool** (interacted within 60 days): Re-engage soon
- **Cold** (no interaction for 60+ days): Urgent re-engagement needed

# Follow-up Strategy
- After initial contact: Follow up within 3-5 business days
- After meeting: Send summary within 24 hours
- Active partners: Monthly check-in minimum
- Dormant contacts: Quarterly value-add touchpoint (share relevant article, industry news)

# Rules
- Never allow a promising relationship to go cold
- Personalize every follow-up — reference previous conversations
- Prioritize high-value relationships over low-priority ones
- Flag relationship risks to Quinn immediately
`;

export async function irisNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "check relationships and follow-ups";

  const relevantMemories = await searchMemories({
    query: taskDescription,
    limit: 8,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relevant Knowledge & Relationship History\n${relevantMemories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("iris", IRIS_CONTEXT + memoryContext);

  const irisTools = [getFollowUpsDueTool, searchOrganizationsTool, createApprovalTool, logAgentActionTool];


  const irisMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(irisMessages) !== "human") {
    irisMessages.push(new HumanMessage("Proceed with relationship management."));
  }
  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(irisTools);
      return await modelWithTools.invoke(irisMessages);
    },
    { temperature: 0.2 },
  );


  if (response.tool_calls?.length && !response.content?.toString().trim()) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = irisTools.find(t => t.name === tc.name);
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      }
    }
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nSummarize your relationship management findings based on these results.`
    );
    response = await withFallback(
      async (model) => model.invoke([...irisMessages, response, followUp]),
      { temperature: 0.2 },
    );
  }

  const irisContent = response.content?.toString()?.trim() || "Relationship check complete.";

  if (irisContent.length > 50) {
    await storeMemory({
      agentName: "IRIS",
      category: "relationships",
      content: irisContent.slice(0, 2000),
      importance: 0.6,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: irisContent,
        name: "iris",
      }),
    ],
    agentReports: [
      {
        agentName: "iris",
        summary: "Relationship management report",
        findings: [irisContent],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}

