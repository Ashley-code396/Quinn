/**
 * Helix — Presentation & Asset Agent
 */

import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { createApprovalTool, logAgentActionTool } from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const HELIX_CONTEXT = `
# Asset Types
Generate: pitch decks, investor decks, sales decks, partnership proposals,
one-pagers, brochures, conference presentations, grant applications.

Output structured content as JSON for dashboard rendering.
Keep messaging consistent with brand. Tailor to audience. Include CTAs.
Submit all materials for approval before sharing.
`;

export async function helixNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {
   const model = new ChatGroq({
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDesc = lastMessage?.content?.toString() ?? "prepare marketing materials";

  const memories = await searchMemories({ query: taskDesc, limit: 8 });
  const memCtx = memories.length > 0
    ? `\n# Relevant Knowledge & Previous Materials\n${memories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const modelWithTools = model.bindTools([createApprovalTool, logAgentActionTool]);
  const helixMessages = [
    new SystemMessage(buildSystemPrompt("helix", HELIX_CONTEXT + memCtx)),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(helixMessages) !== "human") {
    helixMessages.push(new HumanMessage("Proceed with marketing materials preparation."));
  }
  let response = await modelWithTools.invoke(helixMessages);

  const helixTools = [createApprovalTool, logAgentActionTool];

  if (response.tool_calls?.length && !response.content?.toString().trim()) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = helixTools.find(t => t.name === tc.name);
      if (tool) {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      }
    }
    const followUp = new HumanMessage(
      `Tool results:\n\n${toolResults.join("\n\n")}\n\nSummarize your findings based on these results.`
    );
    response = await model.invoke([...helixMessages, response, followUp]);
  }

  const helixContent = response.content?.toString()?.trim() || "Asset preparation complete.";

  if (helixContent.length > 50) {
    await storeMemory({ agentName: "HELIX", category: "materials", content: helixContent.slice(0, 2000), importance: 0.5 }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [new AIMessage({ content: helixContent, name: "helix" })],
    agentReports: [{ agentName: "helix", summary: "Presentation & asset report", findings: [helixContent.slice(0, 500)], recommendations: [], actionItems: [], timestamp: new Date() }],
  };
}
