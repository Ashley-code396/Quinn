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

# Answering Questions vs. Taking Action
- If the CEO asks a QUESTION about what has been done or the current state ("Did you post on LinkedIn today?", "What approvals are pending?", "Any follow-ups due?"), delegate to the agent that owns that data with a CHECK-AND-REPORT instruction. Never ask an agent to create new work in response to a question.
- If the CEO chats casually, greets you, or asks something simple, respond directly and set next to "__end__" — no delegation needed.
- Only delegate a CREATE task (write, draft, research new, find new, generate) when the CEO actually asked you to create something.

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
      "Which agent to delegate to next: 'sage', 'nova', 'atlas', 'iris', 'helix', 'beacon', 'synthesize', or '__end__'. If the user asked a QUESTION about the current state, delegate to the agent that owns that data with a CHECK-and-report instruction. If the user is just chatting, use '__end__' and respond directly. Do NOT send a question to an agent as a create/generate task.",
    ),
  messageToAgent: z
    .string()
    .describe("Clear, specific instructions for the agent you are delegating to. For questions, instruct the agent to CHECK AND REPORT the actual state, not to create new work."),
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
    const words = lower.split(/[^a-z0-9']+/).filter(Boolean);

    // A QUESTION about past/current state (e.g. "Did you post on LinkedIn today?").
    // When present, flips a CREATE route into a CHECK-and-report route.
    const isStatusQuestion =
      /\b(did|have|has|had|was|were|how many|how are|what did|what have|what's the status|status of|update on)\b/i.test(lower);

    interface RouteRule {
      agent: string;
      keywords: string[];
      instruction: string;
      checkInstruction?: string;
    }

    const directReply = (reply: string): Partial<QuinnStateType> => ({
      next: "__end__",
      messages: [new AIMessage({ content: reply, name: "quinn" })],
      iterationCount: iterationCount + 1,
      consultedAgents: [],
      agentReports: [],
      recommendations: [],
      alerts: [],
    });

    // 1) Direct conversational responses — no delegation needed.
    const greetingPhrase = ["good morning", "good afternoon", "good evening", "good night", "how are you", "how's it going", "how are you doing", "how have you been", "what's up", "whats up", "good to see you"].find((p) => lower.includes(p));
    const greetingWord = ["hi", "hello", "hey", "yo", "howdy", "hiya", "sup", "morning", "evening"].find((w) => words.includes(w));
    const isGreeting = !isStatusQuestion && ((!!greetingWord && words.length <= 4) || (!!greetingPhrase && words.length <= 6));
    if (isGreeting) {
      return directReply("Hey! 👋 I'm here and working. What can I help you with?");
    }

    if (/(who are you|what are you|are you a bot|are you real|what do you do|what can you do|^help$|commands)/.test(lower)) {
      return directReply(
        "I'm Quinn, your AI CMO at Dermaqea. I run the marketing team 24/7: " +
        "Sage (research), Nova (content & LinkedIn), Atlas (growth & grants), " +
        "Iris (relationships & follow-ups), Beacon (analytics), and Helix (proposals & decks). " +
        "Ask me anything — or try /today for a summary of what I've done.",
      );
    }

    if (/^(thanks|thank you|thank|thx|ty|appreciate it|appreciated|great job|nice work|awesome|sounds good)\b/.test(lower) && words.length <= 5) {
      return directReply("You're welcome! Anything else I can help with?");
    }

    if (/^(bye|goodbye|good night|see you|talk later|sleep well)/.test(lower)) {
      return directReply("Talk soon! I'll keep working in the background — ping me anytime.");
    }

    // 2) Create / delegation routes. If the request is framed as a status
    //    question ("did you...?"), route to the same agent but ask it to
    //    CHECK AND REPORT instead of creating something new.
    const createRoutes: RouteRule[] = [
      {
        agent: "helix",
        keywords: ["fill in this form", "fill in this application", "fill in", "draft a proposal", "draft proposal", "draft a", "proposal", "grant application", "prepare a pitch deck", "pitch deck for", "apply for"],
        instruction: "Fill in or draft the requested materials with Dermaqea's actual company details. Call create_approval with the complete draft for review.",
        checkInstruction: "The CEO is asking whether a form, proposal, or deck was drafted or submitted. Check what already exists and report factually. Do not draft new materials unless explicitly asked.",
      },
      {
        agent: "atlas",
        keywords: ["growth opportunities", "find opportunities", "active opportunities", "list of grants", "open grants", "upcoming conferences", "accelerator programs", "find partnerships", "pilot customers", "enterprise prospects"],
        instruction: "Search the web for the requested opportunities. For every time-sensitive opportunity, call create_approval so the user can act immediately. Include direct URLs, deadlines, and why Dermaqea should pursue each one.",
        checkInstruction: "The CEO is asking about current opportunities and pipeline. Use get_opportunities to report what exists. Only run new web searches if they ask for fresh finds. Report first; do not create approvals for every item.",
      },
      {
        agent: "sage",
        keywords: ["do research", "research on", "competitor analysis", "industry trends", "market trends", "research about", "look into", "investigate"],
        instruction: "Research the following topic thoroughly using search_web and extract_web_content. Provide detailed findings with sources.",
        checkInstruction: "The CEO is asking a research question. Use search_web / extract_web_content as needed to answer it directly and factually. Do not fabricate findings.",
      },
      {
        agent: "nova",
        keywords: ["write a linkedin post", "write a post", "create a post", "create content", "generate content", "linkedin post about", "blog post", "social media post", "write content"],
        instruction: "Generate the requested content. Call create_content_item to save it and create_approval to submit for review.",
        checkInstruction: "The CEO is asking whether content was created or posted. Use get_content_items and get_linkedin_analytics to check and answer factually. Do NOT create new content.",
      },
      {
        agent: "iris",
        keywords: ["follow up", "who to contact", "relationship check", "crm update"],
        instruction: "Check for overdue follow-ups and relationship health. Recommend specific actions.",
        checkInstruction: "The CEO is asking about follow-ups and relationships. Use get_follow_ups_due and search_organizations to answer factually. Do not create approvals or send anything.",
      },
      {
        agent: "beacon",
        keywords: ["analytics review", "metrics check", "kpi review", "performance report", "dashboard update"],
        instruction: "Review the latest analytics snapshots and quarterly goal progress. Flag any anomalies or metrics behind target.",
        checkInstruction: "The CEO is asking about performance. Use get_analytics_snapshots and get_quarterly_goals to answer factually. Do not create new snapshots.",
      },
    ];

    for (const route of createRoutes) {
      if (route.keywords.some((kw) => lower.includes(kw))) {
        const instruction = isStatusQuestion && route.checkInstruction ? route.checkInstruction : route.instruction;
        return {
          next: route.agent,
          messages: [new AIMessage({ content: `${instruction}\n\nUser request: ${userText}`, name: "quinn" })],
          iterationCount: iterationCount + 1,
          consultedAgents: [route.agent as never],
          agentReports: [],
          recommendations: [],
          alerts: [],
        };
      }
    }

    // 3) Status / check questions — report what actually happened, don't generate.
    const statusRoutes: RouteRule[] = [
      {
        agent: "nova",
        keywords: ["did you post", "have you posted", "did you publish", "have you published", "did you create", "did you write", "did you send", "have you sent", "did you email", "did you share", "what did you post", "post on linkedin", "posted on linkedin", "posting today", "post today", "linkedin post today", "what did you do today", "what have you done", "what happened today", "did you do anything", "what did you accomplish", "any updates", "updates today", "what's new", "whats new", "content today", "any content", "linkedin"],
        instruction: "CHECK AND REPORT. The CEO is asking what was actually done — this is NOT a request to create new content. Call get_content_items (check status and publishedAt), get_linkedin_analytics to see recent posts, and get_pending_approvals. Answer factually and conversationally: did we post today? what is pending approval? Do NOT create any new content or approvals.",
      },
      {
        agent: "beacon",
        keywords: ["analytics", "metrics", "kpi", "performance", "numbers", "goal progress", "on track", "on target", "how are we doing", "tracking", "results", "traffic", "engagement", "followers", "goals"],
        instruction: "CHECK AND REPORT. Use get_analytics_snapshots and get_quarterly_goals to answer factually about KPIs, performance, and goal progress. Do not create new snapshots or records.",
      },
      {
        agent: "iris",
        keywords: ["follow up", "follow-up", "followup", "relationship", "who should i contact", "who to contact", "outreach", "crm", "contacts"],
        instruction: "CHECK AND REPORT. Use get_follow_ups_due and search_organizations to report overdue follow-ups and relationship health. Do not create approvals or send anything.",
      },
      {
        agent: "atlas",
        keywords: ["opportunit", "grants", "conference", "accelerator", "pipeline", "prospect", "deadline", "upcoming", "partnership", "applications"],
        instruction: "CHECK AND REPORT. Use get_opportunities to report current opportunities, pipeline, and deadlines. Only run new web searches if the CEO asks for fresh finds. Report first; do not create approvals for every item.",
      },
      {
        agent: "sage",
        keywords: ["research", "competitor", "industry trend", "market trend", "news", "what's happening", "whats happening", "findings"],
        instruction: "ANSWER the question about research, competitors, or trends. Use search_web / extract_web_content only if fresh information is needed. Report existing findings when possible. Never fabricate.",
      },
      {
        agent: "nova",
        keywords: ["approval", "approve", "pending", "to review", "to sign off", "anything for me"],
        instruction: "CHECK AND REPORT. Call get_pending_approvals and list every item awaiting the CEO's review with its title, priority, and why it was created. Do not create anything new.",
      },
    ];

    for (const route of statusRoutes) {
      if (route.keywords.some((kw) => lower.includes(kw))) {
        return {
          next: route.agent,
          messages: [new AIMessage({ content: `${route.instruction}\n\nUser request: ${userText}`, name: "quinn" })],
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
  const relevantMemories = await (async () => {
    try {
      return isRedisMemoryConfigured()
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
    } catch (e) {
      console.warn("Memory retrieval failed, continuing without memory:", (e as Error).message);
      return [];
    }
  })();

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
      try {
        const structured = model.withStructuredOutput(routingSchema);
        return await structured.invoke(messagesForModel);
      } catch {
        // If structured output fails, synthesize a response directly
        const fallbackResponse = await model.invoke([
          ...messagesForModel,
          new HumanMessage("Provide your analysis and recommendation as plain text."),
        ]);
        return {
          thinking: fallbackResponse.content?.toString() ?? "",
          nextAgent: "synthesize",
          messageToAgent: fallbackResponse.content?.toString() ?? "Summarize and provide recommendations.",
        };
      }
    },
    { temperature: 0.3 },
  );

  const nextAgent = result?.nextAgent ?? "synthesize";
  const messageContent = result?.messageToAgent ?? result?.thinking ?? "No analysis generated.";

  return {
    next: nextAgent,
    messages: [
      new AIMessage({
        content: messageContent,
        name: "quinn",
      }),
    ],
    iterationCount: iterationCount + 1,
    consultedAgents: [...consultedAgents, nextAgent as never],
    ...(isNewUserMessage ? { agentReports, recommendations, alerts } : {}),
  };
}
