/**
 * Daily Briefing Workflow
 *
 * Quinn's morning routine: review goals, consult all agents, produce briefing.
 */

import { HumanMessage } from "@langchain/core/messages";
import type { QuinnGraph } from "../graph.js";
import { getCurrentQuarter } from "@quinn/shared";

export async function runDailyBriefing(graph: QuinnGraph, threadId?: string) {
  const quarter = getCurrentQuarter();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const config = {
    configurable: {
      thread_id: threadId ?? `daily-briefing-${Date.now()}`,
    },
  };

  const result = await graph.invoke(
    {
      trigger: "daily-briefing",
      messages: [
        new HumanMessage({
          content: `Good morning Quinn. It's ${today}. 

Please run your daily executive briefing for Dermaqea:
1. Review our ${quarter} quarterly goals and assess progress
2. Ask Sage for any new research findings or industry developments
3. Ask Nova for content recommendations for this week
4. Ask Atlas for any new growth opportunities or deadlines approaching
5. Ask Iris about any relationship follow-ups due
6. Ask Beacon for the latest analytics snapshot
7. Synthesize everything into a clear executive briefing

Focus on actionable priorities. What needs my attention today?`,
        }),
      ],
    },
    config,
  );

  return result;
}

/**
 * Weekly Report Workflow (Friday)
 */
export async function runWeeklyReport(graph: QuinnGraph, threadId?: string) {
  const config = {
    configurable: {
      thread_id: threadId ?? `weekly-report-${Date.now()}`,
    },
  };

  const result = await graph.invoke(
    {
      trigger: "weekly-report",
      messages: [
        new HumanMessage({
          content: `Quinn, it's Friday. Please generate the weekly marketing report for Dermaqea.

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

Be honest about what went well and what didn't.`,
        }),
      ],
    },
    config,
  );

  return result;
}

/**
 * Weekly Priorities Workflow (Monday)
 */
export async function runWeeklyPriorities(graph: QuinnGraph, threadId?: string) {
  const config = {
    configurable: {
      thread_id: threadId ?? `weekly-priorities-${Date.now()}`,
    },
  };

  const result = await graph.invoke(
    {
      trigger: "weekly-priorities",
      messages: [
        new HumanMessage({
          content: `Quinn, it's Monday. Please set this week's marketing priorities for Dermaqea.

Review:
- Quarterly OKR progress and what needs acceleration
- Content calendar for the week
- Outreach pipeline — who should we contact?
- Any deadlines approaching (grants, conferences, applications)
- Follow-ups that are overdue

Produce a ranked list of this week's top 5 priorities with clear owners and deadlines.`,
        }),
      ],
    },
    config,
  );

  return result;
}

/**
 * Ad-hoc chat with Quinn
 */
export async function chatWithQuinn(
  graph: QuinnGraph,
  message: string,
  threadId?: string,
) {
  const config = {
    configurable: {
      thread_id: threadId ?? `chat-${Date.now()}`,
    },
  };

  const result = await graph.invoke(
    {
      trigger: "chat",
      messages: [new HumanMessage({ content: message })],
    },
    config,
  );

  return result;
}
