/**
 * Synthesize Node
 *
 * Called by Quinn after gathering reports from worker agents.
 * Produces the final executive briefing with prioritized recommendations.
 */

import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { prisma } from "@quinn/database";
import { getMessageType, lastMessageType } from "../messages.js";

const BRIEFING_PROMPT = `You are Quinn, the AI CMO of Dermaqea. You have just received reports from your specialist agents.

Your task is to synthesize findings into a clear, concise response that directly answers the user's question.

Structure your response as follows:

## Executive Summary
2-3 sentence answer to the user's question based on agent findings.

## Key Findings
Concise findings from the agents that are relevant to the question asked.

## Recommendations
List the top 2-3 actionable recommendations, each with:
- **Action**: What to do
- **Why Now**: Why this is timely
- **Expected Impact**: What this achieves
- **Effort**: LOW/MEDIUM/HIGH
- **Confidence**: 0-100%

## Next Steps
What to do with this information.

Be specific and directly address what was asked. Do NOT include generic weekly or quarterly planning language unless that is what was asked about.`;

const WEEKLY_REPORT_PROMPT = `You are Quinn, the AI CMO of Dermaqea. You have just received reports from your specialist agents.

Your task now is to synthesize all findings into a clear, concise weekly executive briefing for the founder.

Structure your briefing as follows:

## Executive Summary
2-3 sentence overview of the week's key findings and priorities.

## Top Priorities (ranked by Impact × Effort)
List the top 3-5 actions to take, each with:
- **Action**: What to do
- **Why Now**: Why this is timely
- **Expected Impact**: What this achieves
- **Effort**: LOW/MEDIUM/HIGH
- **Confidence**: 0-100%

## Agent Reports Summary
Brief summary of what each agent found this week.

## Pending Approvals
List any items waiting for founder approval.

## Alerts & Risks
Any urgent items or risks to flag.

## This Week's Focus
3 key priorities for the coming week.

Be specific, actionable, and strategic. The founder should be able to read this in 5 minutes and know exactly what needs attention.`;

export async function synthesizeNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {

  let originalQuestion = "";
  try {
    if (Array.isArray(state.messages) && state.messages.length > 0) {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const m = state.messages[i];
        if (!m) continue;
        const role = typeof (m as any)._getType === "function" ? (m as any)._getType() : (m as any)?.role;
        if (role === "human") {
          originalQuestion = (m as any)?.content?.toString() ?? "";
          break;
        }
      }
    }
  } catch {
    originalQuestion = "";
  }

  const isBriefingTrigger = ["daily-briefing", "weekly-report", "weekly-priorities", "quarterly-planning"].includes(state.trigger);
  const systemPrompt = isBriefingTrigger ? WEEKLY_REPORT_PROMPT : BRIEFING_PROMPT;

  const reportsContext = state.agentReports.length > 0
    ? state.agentReports.map((r) => `### ${r.agentName.toUpperCase()}\n${r.summary}\nFindings:\n${r.findings.map((f) => `- ${f}`).join("\n")}`).join("\n\n")
    : "No agent reports received yet.";

  const pendingApprovals = await prisma.approval.count({ where: { status: "PENDING" } });

  const synthMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new SystemMessage(`# Original Question\n${originalQuestion || "N/A"}\n\n# Agent Reports\n${reportsContext}\n\n# Pending Approvals\n${pendingApprovals}`),
  ];
  if (!originalQuestion) {
    synthMessages.push(new HumanMessage("Synthesize the findings."));
  }
  const response = await withFallback(
    async (model) => model.invoke(synthMessages),
    { temperature: 0.3 },
  );

  const briefingContent = response.content?.toString() ?? "Briefing generation failed.";

  await prisma.briefing.create({
    data: {
      type: isBriefingTrigger ? "WEEKLY" : "DAILY",
      title: originalQuestion
        ? `Response — ${originalQuestion.slice(0, 80)}${originalQuestion.length > 80 ? "..." : ""}`
        : `Executive Briefing — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
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
