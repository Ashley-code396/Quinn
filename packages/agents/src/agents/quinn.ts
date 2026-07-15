/**
 * Quinn — Chief Marketing Officer (Supervisor Agent)
 *
 * Quinn is the supervisor node that analyzes state, delegates tasks
 * to specialist agents, synthesizes their outputs, and produces
 * executive recommendations.
 */

import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { QuinnStateType } from "../state.js";
import { MAX_ITERATIONS } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { searchMemories } from "../memory/index.js";
import { getCurrentQuarter } from "@quinn/shared";
import { lastMessageType } from "../messages.js";

const QUINN_ADDITIONAL_CONTEXT = `
# Your Daily Responsibilities
1. Review quarterly goals and assess progress.
2. Check active marketing campaigns.
3. Review pending approvals that need human attention.
4. Delegate research tasks to Sage.
5. Request content ideas from Nova.
6. Ask Atlas for growth opportunities.
7. Check Iris for relationship follow-ups.
8. Review Beacon's analytics.
9. Synthesize findings and update priorities.
10. Present a clear executive briefing.

# Delegation Rules
- Delegate to "sage" for research on companies, competitors, industry trends.
- Delegate to "nova" for content creation, calendar planning, thought leadership.
- Delegate to "atlas" for growth opportunities, partnerships, grants, conferences.
- Delegate to "iris" for relationship management, follow-ups, CRM updates.
- Delegate to "helix" for pitch decks, presentations, marketing materials.
- Delegate to "beacon" for analytics, KPI tracking, performance reports.
- When you have enough information, set next to "synthesize" to produce your final briefing.
- Set next to "__end__" when the workflow is complete.

# Decision Framework
Every recommendation MUST include:
- What: specific action to take
- Reasoning: why this matters now
- Expected Impact: quantified if possible
- Effort: LOW / MEDIUM / HIGH
- Confidence Score: 0-100
- Success Metrics: how we measure success
`;

const routingSchema = z.object({
  thinking: z
    .string()
    .describe("Your strategic analysis of the current situation and what needs to happen next."),
  nextAgent: z
    .string()
    .describe(
      "Which agent to delegate to next: 'sage', 'nova', 'atlas', 'iris', 'helix', 'beacon', 'synthesize', or '__end__'",
    ),
  messageToAgent: z
    .string()
    .describe("Clear, specific instructions for the agent you are delegating to."),
});

export async function quinnNode(
  state: QuinnStateType,
): Promise<Partial<QuinnStateType>> {
  // Safety: prevent infinite delegation loops
  if (state.iterationCount >= MAX_ITERATIONS) {
    return {
      next: "__end__",
      messages: [
        new AIMessage({
          content:
            "I've completed my analysis cycle. Let me summarize what we have so far and present my recommendations.",
          name: "quinn",
        }),
      ],
      iterationCount: state.iterationCount + 1,
    };
  }

  const model = new ChatGroq({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
  });

  // Retrieve relevant memories for context
  const relevantMemories = await searchMemories({
    query: state.trigger || "quarterly goals marketing strategy",
    limit: 5,
  });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relevant Memories\n${relevantMemories.map((m) => `- [${m.category}] ${m.content}`).join("\n")}`
    : "";

  const agentReportContext =
    state.agentReports.length > 0
      ? `\n# Agent Reports Received\n${state.agentReports.map((r) => `## ${r.agentName}\n${r.summary}\nFindings: ${r.findings.join(", ")}`).join("\n\n")}`
      : "";

  const consultedContext =
    state.consultedAgents.length > 0
      ? `\nAgents already consulted this session: ${state.consultedAgents.join(", ")}`
      : "";

  const systemPrompt = buildSystemPrompt(
    "quinn",
    QUINN_ADDITIONAL_CONTEXT + memoryContext + agentReportContext + consultedContext,
  );

  const structured = model.withStructuredOutput(routingSchema);

  const messagesForModel = [
    new SystemMessage(systemPrompt),
    ...state.messages,
  ];
  if (lastMessageType(messagesForModel) !== "human") {
    messagesForModel.push(new HumanMessage("Continue with your analysis and decide what to do next."));
  }

  const result = await structured.invoke(messagesForModel);

  return {
    next: result.nextAgent,
    messages: [
      new AIMessage({
        content: result.messageToAgent,
        name: "quinn",
      }),
    ],
    iterationCount: state.iterationCount + 1,
    consultedAgents: [result.nextAgent as never],
  };
}
