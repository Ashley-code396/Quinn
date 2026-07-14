/**
 * Iris — Relationship Management Agent
 *
 * Maintains long-term professional relationships, tracks follow-ups,
 * and ensures no relationship goes cold.
 */

import { ChatGroq } from "@langchain/groq";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  getFollowUpsDueTool,
  searchOrganizationsTool,
  createApprovalTool,
  logAgentActionTool,
} from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";

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
   const model = new ChatGroq({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
    });
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDescription = lastMessage?.content?.toString() ?? "check relationships and follow-ups";

  const relevantMemories = await searchMemories({
    query: taskDescription,
    agentName: "IRIS",
    limit: 5,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relationship History\n${relevantMemories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const systemPrompt = buildSystemPrompt("iris", IRIS_CONTEXT + memoryContext);

  const modelWithTools = model.bindTools([
    getFollowUpsDueTool,
    searchOrganizationsTool,
    createApprovalTool,
    logAgentActionTool,
  ]);

  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages.slice(-5),
  ]);

  if (response.content && typeof response.content === "string" && response.content.length > 50) {
    await storeMemory({
      agentName: "IRIS",
      category: "relationships",
      content: response.content.slice(0, 2000),
      importance: 0.6,
    }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [
      new AIMessage({
        content: response.content?.toString() ?? "Relationship check complete.",
        name: "iris",
      }),
    ],
    agentReports: [
      {
        agentName: "iris",
        summary: "Relationship management report",
        findings: [response.content?.toString()?.slice(0, 500) ?? "No follow-ups due"],
        recommendations: [],
        actionItems: [],
        timestamp: new Date(),
      },
    ],
  };
}
