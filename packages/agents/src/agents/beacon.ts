/**
 * Beacon — Analytics Agent
 */
import { ChatGroq } from "@langchain/groq";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { getAnalyticsSnapshotsTool, getQuarterlyGoalsTool, logAgentActionTool } from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";

const BEACON_CONTEXT = `
# Analytics Responsibilities
Track: LinkedIn growth, website traffic, content performance, outreach metrics,
email response rates, meetings booked, partnership pipeline, grant applications, marketing KPIs.

Generate weekly executive reports. Recommend improvements using data.
Compare current metrics against quarterly key result targets.
Flag metrics that are behind target as risks.
`;

export async function beaconNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {
   const model = new ChatGroq({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
    });
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDesc = lastMessage?.content?.toString() ?? "analyze marketing performance";

  const memories = await searchMemories({ query: taskDesc, agentName: "BEACON", limit: 5 });
  const memCtx = memories.length > 0
    ? `\n# Previous Analytics\n${memories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const modelWithTools = model.bindTools([getAnalyticsSnapshotsTool, getQuarterlyGoalsTool, logAgentActionTool]);
  const response = await modelWithTools.invoke([
    new SystemMessage(buildSystemPrompt("beacon", BEACON_CONTEXT + memCtx)),
    ...state.messages.slice(-5),
  ]);

  if (response.content && typeof response.content === "string" && response.content.length > 50) {
    await storeMemory({ agentName: "BEACON", category: "analytics", content: response.content.slice(0, 2000), importance: 0.6 }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [new AIMessage({ content: response.content?.toString() ?? "Analytics review complete.", name: "beacon" })],
    agentReports: [{ agentName: "beacon", summary: "Analytics & performance report", findings: [response.content?.toString()?.slice(0, 500) ?? "No data"], recommendations: [], actionItems: [], timestamp: new Date() }],
  };
}
