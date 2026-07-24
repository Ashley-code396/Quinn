import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnGraph } from "../graph.js";
import { getCurrentQuarter } from "@quinn/shared";
import type { QuinnStateType } from "../state.js";
import { novaNode, atlasNode, helixNode } from "../agents/index.js";
import { pushFindingsToTelegram, pushApprovalsToTelegram } from "../telegram/index.js";

type StepCallback = (state: Record<string, unknown>) => Promise<void> | void;

async function streamGraph(
  graph: QuinnGraph,
  input: Record<string, unknown>,
  config: Record<string, unknown>,
  onStep?: StepCallback,
) {
  let finalResult: Record<string, unknown> = {};
  const stream = await graph.stream(input, {
    ...config,
    streamMode: "values",
  });
  for await (const state of stream) {
    finalResult = state as Record<string, unknown>;
    if (onStep) await onStep(finalResult);
  }
  return finalResult;
}

export async function runDailyBriefing(graph: QuinnGraph, threadId?: string, onStep?: StepCallback) {
  const quarter = getCurrentQuarter();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return streamGraph(graph,
    {
      trigger: "daily-briefing",
      messages: [new HumanMessage({ content: `Good morning Quinn. It's ${today}. 

Please run your daily executive briefing for Dermaqea:
1. Review our ${quarter} quarterly goals and assess progress
2. Ask Sage for any new research findings or industry developments
3. Ask Nova for content recommendations for this week
4. Ask Atlas for any new growth opportunities or deadlines approaching
5. Ask Iris about any relationship follow-ups due
6. Ask Beacon for the latest analytics snapshot
7. Synthesize everything into a clear executive briefing

Focus on actionable priorities. What needs my attention today?` })],
    },
    { configurable: { thread_id: threadId ?? `daily-briefing-${Date.now()}` } },
    onStep,
  );
}

export async function runWeeklyReport(graph: QuinnGraph, threadId?: string, onStep?: StepCallback) {
  return streamGraph(graph,
    {
      trigger: "weekly-report",
      messages: [new HumanMessage({ content: `Quinn, it's Friday. Please generate the weekly marketing report for Dermaqea.

Include:
- This week's achievements and milestones
- KPI performance (ask Beacon)
- Content published and engagement metrics (ask Nova)
- New research findings (ask Sage)
- Partnership pipeline progress (ask Atlas)
- Relationship health check (ask Iris)
- Missed goals and risks
- Opportunities for next week
- Strategic recommendations

Be honest about what went well and what didn't.` })],
    },
    { configurable: { thread_id: threadId ?? `weekly-report-${Date.now()}` } },
    onStep,
  );
}

export async function runWeeklyPriorities(graph: QuinnGraph, threadId?: string, onStep?: StepCallback) {
  return streamGraph(graph,
    {
      trigger: "weekly-priorities",
      messages: [new HumanMessage({ content: `Quinn, it's Monday. Please set this week's marketing priorities for Dermaqea.

Review:
- Quarterly OKR progress and what needs acceleration
- Content calendar for the week
- Outreach pipeline — who should we contact?
- Any deadlines approaching (grants, conferences, applications)
- Follow-ups that are overdue

Produce a ranked list of this week's top 5 priorities with clear owners and deadlines.` })],
    },
    { configurable: { thread_id: threadId ?? `weekly-priorities-${Date.now()}` } },
    onStep,
  );
}

export async function runQuarterlyPlanning(graph: QuinnGraph, threadId?: string, onStep?: StepCallback) {
  const quarter = getCurrentQuarter();
  return streamGraph(graph,
    {
      trigger: "quarterly-planning",
      messages: [new HumanMessage({ content: `Quinn, it's time for ${quarter} quarterly planning.

Please coordinate with all agents to produce a comprehensive quarterly marketing plan:

1. Review what we accomplished last quarter (ask Beacon for analytics)
2. Evaluate our current position and market landscape (ask Sage)
3. Define ${quarter} objectives and key results
4. Plan the content strategy for the quarter (ask Nova)
5. Identify growth targets — partnerships, grants, pilots (ask Atlas)
6. Assess our relationship pipeline and who we need to engage (ask Iris)
7. Determine what assets and materials we need to prepare (ask Helix)
8. Synthesize everything into a clear quarterly strategy document

Include for each proposed OKR:
- The objective and 3-5 measurable key results
- Strategic rationale
- Resource requirements
- Timeline and milestones
- Success criteria

Be ambitious but realistic given our early-stage constraints.` })],
    },
    { configurable: { thread_id: threadId ?? `quarterly-planning-${Date.now()}` } },
    onStep,
  );
}

export async function chatWithQuinn(
  graph: QuinnGraph,
  message: string,
  threadId?: string,
  onStep?: StepCallback,
) {
  return streamGraph(graph,
    {
      trigger: "chat",
      messages: [new HumanMessage({ content: message })],
    },
    { configurable: { thread_id: threadId ?? `chat-${Date.now()}` } },
    onStep,
  );
}

/**
 * Run an agent autonomously — directly invokes the agent node without
 * going through the Quinn supervisor graph. The agent runs with its
 * full toolset (create_approval, create_content_item, etc.) and takes
 * real actions, then results are pushed to Telegram.
 */
async function runAgentAutonomous(
  agentNode: (state: QuinnStateType) => Promise<Partial<QuinnStateType>>,
  task: string,
  trigger: string,
): Promise<Record<string, unknown>> {
  const state = {
    messages: [new HumanMessage({ content: task })],
    next: "__end__",
    trigger,
    quarterlyGoalsContext: "",
    agentReports: [],
    recommendations: [],
    alerts: [],
    iterationCount: 0,
    consultedAgents: [],
  } as unknown as QuinnStateType;

  const result = await agentNode(state);
  const fullResult = { ...state, ...result } as unknown as Record<string, unknown>;
  await pushFindingsToTelegram(fullResult);
  return fullResult;
}

/** Nova autonomously generates content and submits it for approval. */
export async function runNovaAutonomous(task?: string): Promise<Record<string, unknown>> {
  const result = await runAgentAutonomous(
    novaNode,
    task ?? "It's a new day. Review the content calendar for gaps, search the web for trending skincare/beauty topics that match our pillars, then generate a LinkedIn post. Create the content item and submit it for approval via create_approval. Work autonomously — do not ask for permission, just create and submit.",
    "content-generation",
  );
  await pushApprovalsToTelegram();
  return result;
}

/** Atlas autonomously finds opportunities and creates approval requests. */
export async function runAtlasAutonomous(task?: string): Promise<Record<string, unknown>> {
  return runAgentAutonomous(
    atlasNode,
    task ?? "Proactive opportunity sweep. Search the web for currently open grant programs, conferences accepting applications, and accelerators with upcoming deadlines in beauty-tech, anti-counterfeit, supply chain, and consumer safety. For every time-sensitive opportunity you find, create an approval request via create_approval with type GRANT_APPLICATION or CONFERENCE_REGISTRATION so the user can apply immediately. Include full details — name, URL, deadline, and why Dermaqea should pursue it.",
    "opportunity-sweep",
  );
}

/** Helix autonomously drafts proposals and submits for approval. */
export async function runHelixAutonomous(task?: string): Promise<Record<string, unknown>> {
  return runAgentAutonomous(
    helixNode,
    task ?? "Proactive proposal drafting. Based on recent opportunities, grants, and partnership leads in memory, draft a grant application or partnership proposal. Structure it with clear sections, key messaging aligned with Dermaqea's mission, and a compelling case. Submit the full draft for approval via create_approval so the user can review and approve it immediately.",
    "proposal-drafting",
  );
}
