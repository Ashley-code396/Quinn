/**
 * Beacon — Analytics Agent
 */
import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { getAnalyticsSnapshotsTool, createAnalyticsSnapshotTool, getQuarterlyGoalsTool, logAgentActionTool, searchWebTool } from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const BEACON_CONTEXT = `
# Analytics Responsibilities
Track: LinkedIn growth (followers, engagement, impressions, clicks), website traffic,
content performance, outreach metrics, email response rates, meetings booked,
partnership pipeline, grant applications, marketing KPIs.

# Account Monitoring
- When given LinkedIn analytics data, use create_analytics_snapshot to record it as a daily snapshot
- Monitor trends: is engagement growing? Are followers increasing? Which content performs best?
- Compare current metrics against quarterly key result targets
- Flag metrics that are behind target as risks

Generate weekly executive reports. Recommend improvements using data.
`;

export async function beaconNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDesc = lastMessage?.content?.toString() ?? "analyze marketing performance";

  const memories = await (async () => {
    try {
      return await searchMemories({ query: taskDesc, limit: 8 });
    } catch (e) {
      console.warn("Memory search failed, continuing without it:", (e as Error).message);
      return [];
    }
  })();
  const memCtx = memories.length > 0
    ? `\n# Relevant Knowledge & Previous Analytics\n${memories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const beaconTools = [searchWebTool, getAnalyticsSnapshotsTool, createAnalyticsSnapshotTool, getQuarterlyGoalsTool, logAgentActionTool];

  const beaconMessages = [
    new SystemMessage(buildSystemPrompt("beacon", BEACON_CONTEXT + memCtx)),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(beaconMessages) !== "human") {
    beaconMessages.push(new HumanMessage("Proceed with analytics review."));
  }
  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(beaconTools);
      return await modelWithTools.invoke(beaconMessages);
    },
    { temperature: 0.2 },
  );

  if (response.tool_calls?.length) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = beaconTools.find(t => t.name === tc.name);
      if (!tool) continue;
      try {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      } catch (err) {
        toolResults.push(`${tc.name} failed: ${(err as Error).message}`);
      }
    }
    const existingContent = response.content?.toString()?.trim() || "Tools executed.";
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nYour previous message: ${existingContent.slice(0, 1000)}\n\nSummarize your analytics findings based on these results.`
    );
    response = await withFallback(
      async (model) => model.invoke([...beaconMessages, response, followUp]),
      { temperature: 0.2 },
    );
  }

  const beaconContent = response.content?.toString()?.trim() || "Analytics review complete.";

  if (beaconContent.length > 50) {
    await storeMemory({ agentName: "BEACON", category: "analytics", content: beaconContent.slice(0, 2000), importance: 0.6 }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [new AIMessage({ content: beaconContent, name: "beacon" })],
    agentReports: [{ agentName: "beacon", summary: "Analytics & performance report", findings: [beaconContent], recommendations: [], actionItems: [], timestamp: new Date() }],
  };
}
