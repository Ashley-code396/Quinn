/**
 * Quinn — Chief Marketing Officer (Supervisor Agent)
 *
 * Quinn is the supervisor node that analyzes state, delegates tasks
 * to specialist agents, synthesizes their outputs, and produces
 * executive recommendations.
 */

import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { QuinnStateType } from "../state.js";
import { MAX_ITERATIONS } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { searchMemories, isRedisMemoryConfigured, searchLongTermMemory } from "../memory/index.js";
import { getCurrentQuarter } from "@quinn/shared";
import { lastMessageType } from "../messages.js";
import { createModel, withFallback } from "../llm.js";

const QUINN_ADDITIONAL_CONTEXT = `
# Your Role
You are Quinn, the CEO's AI Chief Marketing Officer. You are also a friendly, conversational partner. The CEO talks to you throughout the day — sometimes about marketing, sometimes just casual chat. Be warm, professional, and natural.

# Conversation
- If the CEO greets you, chats casually, or asks something simple, respond directly and conversationally. Set next to "__end__" and put your natural response in messageToAgent.
- Use a warm, professional tone. Be concise but human.
- You can acknowledge requests, ask clarifying questions, or give quick answers without delegating to other agents.

# Marketing Work (Daily Responsibilities)
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
- Delegate to "sage" for industry research, competitor analysis, market trends, counterfeit landscape.
- Delegate to "nova" for content creation, calendar planning, thought leadership, LinkedIn posts.
- Delegate to "atlas" for identifying enterprise prospects, evaluating pilot customers, partnerships, grants, and conferences. Atlas evaluates and scores opportunities — use Atlas when you need to rank companies by strategic fit.
- Delegate to "iris" for relationship management, follow-ups, CRM updates.
- Delegate to "helix" for pitch decks, presentations, grant applications, partnership proposals, **and filling in application portal forms**. Helix drafts the actual content and submits for approval — **use Helix when someone needs to fill in a form, write a proposal, or prepare application materials.**
- Delegate to "beacon" for analytics, KPI tracking, performance reports.
- When you have enough information, set next to "synthesize" to produce your final briefing.
- Set next to "__end__" when done — this sends your messageToAgent back to the CEO as your response.

# Agent Selection Rules
- Pick ONLY the agents needed for the specific task. Do NOT cycle through all agents. Do NOT run research agents when the task is drafting.
- **CRITICAL: If the user asks to fill in a form, apply for something, or draft an application → delegate to "helix" immediately. Do NOT run sage (research) or any other agent first. Helix has Dermaqea's company info baked in and will fill the form correctly.**
- Examples:
  - "Check LinkedIn analytics" → delegate to beacon, then synthesize
  - "Write a LinkedIn post about counterfeits" → delegate to nova, then synthesize
  - "Research competitors" → delegate to sage, then synthesize
  - "Full quarterly briefing" → delegate to all relevant agents (typically sage, nova, atlas, beacon), then synthesize
  - "Follow up with a partner" → delegate to iris, then synthesize
  - **"Fill in this L'Oreal application form" → delegate to helix, then synthesize. Do NOT run sage first.**
  - **"Draft a grant application" → delegate to helix, then synthesize. No research needed.**
- After an agent returns, check if you need more agents or have enough to synthesize.
- Call synthesize when you have sufficient information. Do NOT force agents that aren't needed.
- Check consultedAgents to avoid re-delegating to an agent already consulted this session.

# Decision Framework (for marketing recommendations)
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
  const lastMsg = state.messages[state.messages.length - 1];
  const isNewUserMessage = lastMsg?._getType() === "human";
  const iterationCount = isNewUserMessage ? 0 : state.iterationCount;
  const consultedAgents = isNewUserMessage ? [] : state.consultedAgents;
  const agentReports = isNewUserMessage ? [] : state.agentReports;
  const recommendations = isNewUserMessage ? [] : state.recommendations;
  const alerts = isNewUserMessage ? [] : state.alerts;

  // Pre-check: rule-based routing for common request patterns.
  // Bypasses the LLM routing decision since models consistently route
  // everything to Sage regardless of the prompt instructions.
  if (isNewUserMessage) {
    const userText = lastMsg?.content?.toString() ?? "";
    const lower = userText.toLowerCase();

    interface RouteRule {
      agent: string;
      keywords: string[];
      instruction: string;
    }

    const routes: RouteRule[] = [
      {
        agent: "helix",
        keywords: ["fill in this form", "fill in this application", "fill in", "draft a proposal", "draft proposal", "grant application", "prepare a pitch deck", "pitch deck for"],
        instruction: "Fill in or draft the requested materials with Dermaqea's actual company details. Call create_approval with the complete draft for review.",
      },
      {
        agent: "atlas",
        keywords: ["growth opportunities", "find opportunities", "active opportunities", "list of grants", "open grants", "upcoming conferences", "accelerator programs", "find partnerships", "pilot customers", "enterprise prospects"],
        instruction: "Search the web for the requested opportunities. For every time-sensitive opportunity, call create_approval so the user can act immediately. Include direct URLs, deadlines, and why Dermaqea should pursue each one.",
      },
      {
        agent: "sage",
        keywords: ["do research", "research on", "competitor analysis", "industry trends", "market trends", "research about", "look into", "investigate"],
        instruction: "Research the following topic thoroughly using search_web and extract_web_content. Provide detailed findings with sources.",
      },
      {
        agent: "nova",
        keywords: ["write a linkedin post", "write a post", "create a post", "create content", "linkedin post about", "blog post", "social media post"],
        instruction: "Generate the requested content. Call create_content_item to save it and create_approval to submit for review.",
      },
      {
        agent: "iris",
        keywords: ["follow up", "who to contact", "relationship check", "crm update"],
        instruction: "Check for overdue follow-ups and relationship health. Recommend specific actions.",
      },
      {
        agent: "beacon",
        keywords: ["analytics review", "metrics check", "kpi review", "performance report", "dashboard update"],
        instruction: "Review the latest analytics snapshots and quarterly goal progress. Flag any anomalies or metrics behind target.",
      },
    ];

    for (const route of routes) {
      if (route.keywords.some((kw) => lower.includes(kw))) {
        return {
          next: route.agent,
          messages: [
            new AIMessage({
              content: `${route.instruction}\n\nUser request: ${userText}`,
              name: "quinn",
            }),
          ],
          iterationCount: iterationCount + 1,
          consultedAgents: [route.agent as never],
          agentReports: [],
          recommendations: [],
          alerts: [],
        };
      }
    }
  }

  // Safety: prevent infinite delegation loops
  if (iterationCount >= MAX_ITERATIONS) {
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

  // Retrieve relevant memories for context
  const relevantMemories = isRedisMemoryConfigured()
    ? await searchLongTermMemory({
        query: state.trigger || "quarterly goals marketing strategy",
        ownerId: "quinn",
        namespace: "agent-context",
        limit: 5,
        similarityThreshold: 0.7,
      })
    : await searchMemories({
        query: state.trigger || "quarterly goals marketing strategy",
        limit: 5,
      });

  const memoryContext = relevantMemories.length > 0
    ? `\n# Relevant Memories\n${relevantMemories.map((m) => {
        const record = m as Record<string, unknown>;
        const text = (record.text ?? record.content ?? "") as string;
        const tag = record.category ?? (record.topics as string[])?.[0] ?? "memory";
        return `- [${tag}] ${text}`;
      }).join("\n")}`
    : "";

  const agentReportContext =
    agentReports.length > 0
      ? `\n# Agent Reports Received\n${agentReports.map((r) => `## ${r.agentName}\n${r.summary}\nFindings: ${r.findings.join(", ")}`).join("\n\n")}`
      : "";

  const consultedContext =
    consultedAgents.length > 0
      ? `\nAgents already consulted this session: ${consultedAgents.join(", ")}`
      : "";

  const freshRequestContext = isNewUserMessage
    ? `\n# Fresh Request\nThis is a NEW message from the user — treat it independently. Do NOT continue previous agent research or re-delegate to an agent that already reported. Read the user's latest message and respond to what they are asking NOW. If they are greeting you, greet back. If they are asking for something new, delegate ONLY the relevant agent.`
    : "";

  const systemPrompt = buildSystemPrompt(
    "quinn",
    QUINN_ADDITIONAL_CONTEXT + memoryContext + agentReportContext + consultedContext + freshRequestContext,
  );

  // Limit message history to last 10 exchanges to stay within token limits
  const recentMessages = state.messages.slice(-10);

  const messagesForModel = [
    new SystemMessage(systemPrompt),
    ...recentMessages,
  ];
  if (lastMessageType(messagesForModel) !== "human") {
    messagesForModel.push(new HumanMessage("Continue with your analysis and decide what to do next."));
  }

  const result = await withFallback(
    async (model) => {
      const structured = model.withStructuredOutput(routingSchema);
      return await structured.invoke(messagesForModel);
    },
    { temperature: 0.3 },
  );

  return {
    next: result.nextAgent,
    messages: [
      new AIMessage({
        content: result.messageToAgent,
        name: "quinn",
      }),
    ],
    iterationCount: iterationCount + 1,
    consultedAgents: [...consultedAgents, result.nextAgent as never],
    ...(isNewUserMessage ? { agentReports, recommendations, alerts } : {}),
  };
}
