/**
 * Synthesize Node
 *
 * Called by Quinn after gathering reports from worker agents.
 * Produces the final executive briefing with prioritized recommendations.
 */

import { ChatGroq } from "@langchain/groq";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { prisma } from "@quinn/database";

const SYNTHESIZE_PROMPT = `You are Quinn, the AI CMO of Dermaqea. You have just received reports from your specialist agents.

Your task now is to synthesize all findings into a clear, concise executive briefing for the founder.

Structure your briefing as follows:

## Executive Summary
2-3 sentence overview of the day's key findings and priorities.

## Top Priorities (ranked by Impact × Effort)
List the top 3-5 actions to take, each with:
- **Action**: What to do
- **Why Now**: Why this is timely
- **Expected Impact**: What this achieves
- **Effort**: LOW/MEDIUM/HIGH
- **Confidence**: 0-100%

## Agent Reports Summary
Brief summary of what each agent found.

## Pending Approvals
List any items waiting for founder approval.

## Alerts & Risks
Any urgent items or risks to flag.

## This Week's Focus
3 key priorities for the coming days.

Be specific, actionable, and strategic. The founder should be able to read this in 5 minutes and know exactly what needs attention.`;

export async function synthesizeNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {
   const model = new ChatGroq({
      model: "groq/compound",
      temperature: 0.3,
    });

  const reportsContext = state.agentReports.length > 0
    ? state.agentReports.map((r) => `### ${r.agentName.toUpperCase()}\n${r.summary}\nFindings:\n${r.findings.map((f) => `- ${f}`).join("\n")}`).join("\n\n")
    : "No agent reports received yet.";

  const pendingApprovals = await prisma.approval.count({ where: { status: "PENDING" } });

  const response = await model.invoke([
    new SystemMessage(SYNTHESIZE_PROMPT),
    new SystemMessage(`# Agent Reports\n${reportsContext}\n\n# Pending Approvals: ${pendingApprovals}`),
    ...state.messages.slice(-10),
  ]);

  const briefingContent = response.content?.toString() ?? "Briefing generation failed.";

  // Save briefing to database
  await prisma.briefing.create({
    data: {
      type: state.trigger === "weekly-report" ? "WEEKLY" : state.trigger === "quarterly-planning" ? "QUARTERLY" : "DAILY",
      title: `Executive Briefing — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      summary: briefingContent,
      sections: state.agentReports.map((r) => ({ agent: r.agentName, title: r.summary, content: r.findings.join("\n") })),
      priorities: state.recommendations as any,
      alerts: state.alerts as any,
    },
  });

  return {
    next: "__end__",
    messages: [new AIMessage({ content: briefingContent, name: "quinn" })],
  };
}
