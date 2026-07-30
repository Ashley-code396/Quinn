import { prisma } from "@quinn/database";

export type DailySummary = {
  linkedinPosted: { title: string; url?: string }[];
  emailsSent: { to: string; subject: string }[];
  eventsRegistered: { event: string; success: boolean }[];
  grantsApplied: { title: string }[];
  proposalsSent: { title: string }[];
  approvals: { approved: number; rejected: number };
  findingsCount: number;
};

function jsonToRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch {}
    return null;
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function extractString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export async function getTodaysSummary(): Promise<DailySummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const logs = await prisma.agentLog.findMany({
    where: {
      createdAt: { gte: today, lt: tomorrow },
      action: {
        in: [
          "linkedin_post_published",
          "email_sent",
          "event_registered",
          "event_registration_attempted",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const approvals = await prisma.approval.findMany({
    where: {
      reviewedAt: { gte: today, lt: tomorrow },
      status: { in: ["APPROVED", "REJECTED"] },
    },
  });

  const allLogs = await prisma.agentLog.count({
    where: { createdAt: { gte: today, lt: tomorrow } },
  });

  const summary: DailySummary = {
    linkedinPosted: [],
    emailsSent: [],
    eventsRegistered: [],
    grantsApplied: [],
    proposalsSent: [],
    approvals: { approved: 0, rejected: 0 },
    findingsCount: allLogs,
  };

  for (const log of logs) {
    const input = jsonToRecord(log.input);
    const output = jsonToRecord(log.output);

    switch (log.action) {
      case "linkedin_post_published":
        summary.linkedinPosted.push({
          title: extractString(input?.title, log.action),
          url: output?.urn
            ? `https://www.linkedin.com/feed/update/${extractString(output.urn, "")}`
            : undefined,
        });
        break;
      case "email_sent":
        summary.emailsSent.push({
          to: extractString(input?.to, "unknown"),
          subject: extractString(input?.subject, "no subject"),
        });
        break;
      case "event_registered":
        summary.eventsRegistered.push({
          event: extractString(input?.eventName, extractString(input?.title, "unknown event")),
          success: true,
        });
        break;
      case "event_registration_attempted":
        summary.eventsRegistered.push({
          event: extractString(input?.eventName, extractString(input?.title, "unknown event")),
          success: false,
        });
        break;
    }
  }

  for (const a of approvals) {
    if (a.status === "APPROVED") summary.approvals.approved++;
    else summary.approvals.rejected++;
  }

  return summary;
}

export function formatSummary(summary: DailySummary): string {
  const parts: string[] = [];
  parts.push("📋 *Here's what I did today:*\n");

  if (summary.linkedinPosted.length > 0) {
    parts.push("*📱 LinkedIn Posts*");
    for (const p of summary.linkedinPosted) {
      parts.push(`• Posted: "${p.title}"${p.url ? `\n  ${p.url}` : ""}`);
    }
    parts.push("");
  }

  if (summary.emailsSent.length > 0) {
    parts.push("*📧 Emails Sent*");
    for (const e of summary.emailsSent) {
      parts.push(`• "${e.subject}" → ${e.to}`);
    }
    parts.push("");
  }

  if (summary.eventsRegistered.length > 0) {
    parts.push("*🎟️ Event Registrations*");
    for (const e of summary.eventsRegistered) {
      const icon = e.success ? "✅" : "⚠️";
      parts.push(`• ${icon} ${e.event}`);
    }
    parts.push("");
  }

  if (summary.approvals.approved > 0 || summary.approvals.rejected > 0) {
    parts.push("*📋 Approvals*");
    if (summary.approvals.approved > 0) {
      parts.push(`• ✅ Approved: ${summary.approvals.approved}`);
    }
    if (summary.approvals.rejected > 0) {
      parts.push(`• ❌ Rejected: ${summary.approvals.rejected}`);
    }
    parts.push("");
  }

  if (summary.findingsCount === 0) {
    parts.push("🤷 Quiet day — nothing was executed yet. Approve something and I'll get to work!");
  } else {
    parts.push(`📊 Total actions logged: ${summary.findingsCount}`);
  }

  return parts.join("\n").trim();
}
