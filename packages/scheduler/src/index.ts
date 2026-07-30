/**
 * Quinn Scheduler
 *
 * BullMQ-based cron job system that triggers Quinn's
 * daily, weekly, and quarterly workflows.
 */

import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  buildQuinnGraph,
  runDailyBriefing,
  runWeeklyReport,
  runWeeklyPriorities,
  runQuarterlyPlanning,
  chatWithQuinn,
  runNovaAutonomous,
  runAtlasAutonomous,
  runHelixAutonomous,
  isLinkedInConfigured,
  getLinkedInPageAnalytics,
  pushApprovalsToTelegram,
  pushFindingsToTelegram,
  getTodaysSummary,
  formatSummary,
} from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";
import type { AgentReport } from "@quinn/shared";

const QUEUE_NAME = "quinn-scheduler";

async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {}
}

// Dedicated Redis connection for BullMQ — uses its own connection
// so blocking commands (bzpopmin) don't interfere with the shared cache client.
let queueConnection: Redis | null = null;
function getQueueConnection(): Redis {
  if (!queueConnection) {
    queueConnection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      connectTimeout: 10_000,
      retryStrategy(times) {
        return Math.min(times * 1000, 10_000);
      },
      keepAlive: 10_000,
    });
    queueConnection.on("error", (err) => {
      if (err.message !== "Stream is closed" && !err.message?.includes("ECONNRESET")) {
        console.error("⚠️ BullMQ Redis error:", err.message);
      }
    });
  }
  return queueConnection;
}

export async function createScheduler() {
  const connection = getQueueConnection();

  const queue = new Queue(QUEUE_NAME, { connection: connection as any });

  // ---- Register Cron Schedules ----

  // Daily briefing — every day at 8:00 AM
  await queue.upsertJobScheduler(
    "daily-briefing",
    { pattern: "0 8 * * *" },
    { name: "daily-briefing", data: { workflow: "daily-briefing" } },
  );

  // Morning research sweep — every day at 6:00 AM
  await queue.upsertJobScheduler(
    "research-sweep",
    { pattern: "0 6 * * *" },
    { name: "research-sweep", data: { workflow: "research-sweep" } },
  );

  // Analytics snapshot — every day at 7:00 AM
  await queue.upsertJobScheduler(
    "analytics-snapshot",
    { pattern: "0 7 * * *" },
    { name: "analytics-snapshot", data: { workflow: "analytics-snapshot" } },
  );

  // Content generation + LinkedIn post with image/video — every day at 7:30 AM
  await queue.upsertJobScheduler(
    "content-generation",
    { pattern: "30 7 * * *" },
    { name: "content-generation", data: { workflow: "content-generation" } },
  );

  // LinkedIn monitoring (Dermaqea account) — every day at 9:00 AM
  await queue.upsertJobScheduler(
    "linkedin-monitor",
    { pattern: "0 9 * * *" },
    { name: "linkedin-monitor", data: { workflow: "linkedin-monitor" } },
  );

  // Relationship follow-up check — once daily at 10:00 AM
  await queue.upsertJobScheduler(
    "follow-up-check",
    { pattern: "0 10 * * *" },
    { name: "follow-up-check", data: { workflow: "follow-up-check" } },
  );

  // Morning opportunity sweep (Atlas + Helix) — every day at 11:00 AM
  await queue.upsertJobScheduler(
    "opportunity-sweep",
    { pattern: "0 11 * * *" },
    { name: "opportunity-sweep", data: { workflow: "opportunity-sweep" } },
  );

  // Afternoon research sweep — every day at 2:00 PM
  await queue.upsertJobScheduler(
    "research-sweep-afternoon",
    { pattern: "0 14 * * *" },
    { name: "research-sweep-afternoon", data: { workflow: "research-sweep-afternoon" } },
  );

  // Afternoon opportunity sweep (Atlas + Helix) — every day at 3:00 PM
  await queue.upsertJobScheduler(
    "opportunity-sweep-afternoon",
    { pattern: "0 15 * * *" },
    { name: "opportunity-sweep-afternoon", data: { workflow: "opportunity-sweep-afternoon" } },
  );

  // LinkedIn engagement monitor — every day at 6:00 PM
  await queue.upsertJobScheduler(
    "linkedin-evening-monitor",
    { pattern: "0 18 * * *" },
    { name: "linkedin-evening-monitor", data: { workflow: "linkedin-evening-monitor" } },
  );

  // End-of-day summary — every day at 7:00 PM
  await queue.upsertJobScheduler(
    "daily-summary",
    { pattern: "0 19 * * *" },
    { name: "daily-summary", data: { workflow: "daily-summary" } },
  );

  // Weekly priorities — Monday at 9:00 AM
  await queue.upsertJobScheduler(
    "weekly-priorities",
    { pattern: "0 9 * * 1" },
    { name: "weekly-priorities", data: { workflow: "weekly-priorities" } },
  );

  // Weekly report — Friday at 5:00 PM
  await queue.upsertJobScheduler(
    "weekly-report",
    { pattern: "0 17 * * 5" },
    { name: "weekly-report", data: { workflow: "weekly-report" } },
  );

  // Quarterly planning — 1st day of Jan, Apr, Jul, Oct at 9 AM
  await queue.upsertJobScheduler(
    "quarterly-planning",
    { pattern: "0 9 1 1,4,7,10 *" },
    { name: "quarterly-planning", data: { workflow: "quarterly-planning" } },
  );

  console.log("📅 Quinn scheduler initialized with cron jobs:");
  console.log("   • Research sweep (AM):        0 6 * * *");
  console.log("   • Analytics snapshot:          0 7 * * *");
  console.log("   • Content + LinkedIn post:     30 7 * * *   (Nova — w/ image/video)");
  console.log("   • Daily briefing:              0 8 * * *");
  console.log("   • LinkedIn monitor (AM):       0 9 * * *");
  console.log("   • Follow-up check:             0 10 * * *   (once daily)");
  console.log("   • Opportunity sweep (AM):      0 11 * * *   (Atlas + Helix)");
  console.log("   • Research sweep (PM):         0 14 * * *");
  console.log("   • Opportunity sweep (PM):      0 15 * * *   (Atlas + Helix)");
   console.log("   • LinkedIn monitor (PM):       0 18 * * *");
   console.log("   • Daily summary:                0 19 * * *   (what I did today)");
   console.log("   • Weekly priorities:           0 9 * * 1");
  console.log("   • Weekly report:               0 17 * * 5");
  console.log("   • Quarterly planning:          0 9 1 1,4,7,10 *");

  return { queue };
}

export async function createWorker() {
  const connection = getQueueConnection();

  let graph: QuinnGraph | null = null;

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      console.log(`\n🤖 Quinn workflow triggered: ${job.name} at ${new Date().toISOString()}`);

      // Lazy-init the graph
      if (!graph) {
        graph = await buildQuinnGraph();
      }

      const startTime = Date.now();

      const makeOnStep = () => {
        let seenReportCount = 0;
        return async (state: Record<string, unknown>) => {
          const reports = (state.agentReports as AgentReport[] | undefined) ?? [];
          if (reports.length > seenReportCount) {
            await pushFindingsToTelegram(state, seenReportCount);
            seenReportCount = reports.length;
          }
        };
      };

      try {
        let result: Record<string, unknown> | null = null;
        const onStep = makeOnStep();

        switch (job.data.workflow) {
          case "daily-briefing":
            result = await runDailyBriefing(graph, undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "research-sweep":
            result = await chatWithQuinn(graph, "Run a morning research sweep. Ask Sage to search for new industry developments, competitor news, and emerging opportunities. Store any findings.", undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "research-sweep-afternoon":
            result = await chatWithQuinn(graph, "Run an afternoon research sweep. Ask Sage to search for any late-breaking industry news, competitor moves, or emerging opportunities that came up today. Store any findings.", undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "analytics-snapshot":
            result = await chatWithQuinn(graph, "Run the analytics snapshot. Ask Beacon to review all KPIs, check quarterly goal progress, and flag any anomalies or metrics behind target.", undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "content-generation":
            result = await runNovaAutonomous("Generate content for today. Options (choose based on what's most valuable right now): (1) A LinkedIn post with matching image, (2) A PDF whitepaper or one-pager on a relevant topic using generate_pdf, (3) A slide deck on an industry topic using generate_slides. Vary the format day-to-day — don't always do the same type. Submit everything for approval via create_approval — never publish directly.") as unknown as Record<string, unknown>;
            break;
          case "linkedin-monitor": {
            if (isLinkedInConfigured()) {
              const analytics = await getLinkedInPageAnalytics();
              console.log(`  📊 Dermaqea LinkedIn analytics — followers: ${analytics.followers}, engagement: ${analytics.engagement}, impressions: ${analytics.impressions}`);
              result = await chatWithQuinn(graph, `LinkedIn performance check for Dermaqea. Today's analytics: ${JSON.stringify(analytics)}. Ask Beacon to log this as an analytics snapshot. Review what's working and suggest content strategy adjustments for better Dermaqea engagement.`, undefined, onStep) as unknown as Record<string, unknown>;
            } else {
              console.log("  ⏭️ LinkedIn not configured — skipping monitoring");
            }
            break;
          }
          case "linkedin-evening-monitor": {
            if (isLinkedInConfigured()) {
              const analytics = await getLinkedInPageAnalytics();
              console.log(`  📊 Dermaqea LinkedIn evening analytics — followers: ${analytics.followers}, engagement: ${analytics.engagement}, impressions: ${analytics.impressions}`);
              const alertLevel = analytics.engagement > 50 ? "great" : analytics.engagement > 10 ? "moderate" : "low";
              result = await chatWithQuinn(graph, `Evening LinkedIn performance check for Dermaqea. Today's analytics: ${JSON.stringify(analytics)}. Engagement is ${alertLevel}. Ask Beacon to log this as an analytics snapshot. Summarize the day's LinkedIn performance for Dermaqea.`, undefined, onStep) as unknown as Record<string, unknown>;
            } else {
              console.log("  ⏭️ LinkedIn not configured — skipping evening monitor");
            }
            break;
          }
          case "daily-summary": {
            const summary = await getTodaysSummary();
            const formatted = formatSummary(summary);
            await sendTelegramMessage(formatted);
            console.log(`  📋 Daily summary pushed — ${summary.findingsCount} actions logged`);
            break;
          }
          case "follow-up-check":
            result = await chatWithQuinn(graph, "Daily relationship check. Ask Iris to review all relationships once — only flag things that need immediate attention today. Skip routine overdue reminders.", undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "opportunity-sweep":
            result = await runAtlasAutonomous("Morning opportunity sweep. Find new prospects, partners, grants, and conferences. For every company you identify, draft a personalized outreach email with subject, body, and their contact info. Create approval requests with type EMAIL for outreach emails, GRANT_APPLICATION for grants, CONFERENCE_REGISTRATION for events. Include full draft content so it's ready to send upon approval. For events/conferences, include the registration URL in the approval so Helix can auto-register.") as unknown as Record<string, unknown>;
            if (result) {
              await runHelixAutonomous("Review the opportunities Atlas just found. For any CONFERENCE_REGISTRATION opportunities, use register_for_event to actually register Dermaqea for those events. For the top prospect, generate a PDF or slide deck using generate_pdf or generate_slides. Draft outreach emails for the top 2 companies. Submit everything for approval via create_approval.");
            }
            break;
          case "opportunity-sweep-afternoon":
            result = await runAtlasAutonomous("Afternoon opportunity sweep. Search for new grant deadlines, conference windows, and companies. For every organization, draft the outreach email (to, subject, body) and submit for approval. Include registration URLs for any events.") as unknown as Record<string, unknown>;
            if (result) {
              await runHelixAutonomous("Review the afternoon opportunities. Register for any events using register_for_event tool. Generate a PDF one-pager for the top prospect using generate_pdf. Draft outreach emails for the top 3 companies. Submit for approval.");
            }
            break;
          case "weekly-report":
            result = await runWeeklyReport(graph, undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "weekly-priorities":
            result = await runWeeklyPriorities(graph, undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "quarterly-planning":
            result = await runQuarterlyPlanning(graph, undefined, onStep) as unknown as Record<string, unknown>;
            break;
          default:
            console.warn(`Unknown workflow: ${job.data.workflow}`);
        }

        if (result) await pushFindingsToTelegram(result);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Workflow ${job.name} completed in ${duration}s`);
      } catch (error) {
        console.error(`❌ Workflow ${job.name} failed:`, error);
        throw error;
      }
    },
    {
      connection: connection as any,
      concurrency: 1, // Process one workflow at a time
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.name} failed:`, err.message);
  });

  console.log("👷 Quinn scheduler worker started, waiting for jobs...");
  return worker;
}

/**
 * Manually trigger a workflow (used by the API).
 */
export async function triggerWorkflow(
  queue: Queue,
  workflow: string,
): Promise<string> {
  const job = await queue.add(workflow, { workflow }, { priority: 1 });
  return job.id ?? "unknown";
}
