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
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
    });
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDesc = lastMessage?.content?.toString() ?? "prepare marketing materials";

  const memories = await searchMemories({ query: taskDesc, agentName: "HELIX", limit: 5 });
  const memCtx = memories.length > 0
    ? `\n# Previous Materials\n${memories.map((m) => `- ${m.content}`).join("\n")}`
    : "";

  const modelWithTools = model.bindTools([createApprovalTool, logAgentActionTool]);
  const helixMessages = [
    new SystemMessage(buildSystemPrompt("helix", HELIX_CONTEXT + memCtx)),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(helixMessages) !== "human") {
    helixMessages.push(new HumanMessage("Proceed with marketing materials preparation."));
  }
  const response = await modelWithTools.invoke(helixMessages);

  if (response.content && typeof response.content === "string" && response.content.length > 50) {
    await storeMemory({ agentName: "HELIX", category: "materials", content: response.content.slice(0, 2000), importance: 0.5 }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [new AIMessage({ content: response.content?.toString() ?? "Asset preparation complete.", name: "helix" })],
    agentReports: [{ agentName: "helix", summary: "Presentation & asset report", findings: [response.content?.toString()?.slice(0, 500) ?? "No assets generated"], recommendations: [], actionItems: [], timestamp: new Date() }],
  };
}
