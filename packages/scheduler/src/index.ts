/**
 * Quinn Scheduler
 *
 * BullMQ-based cron job system that triggers Quinn's
 * daily, weekly, and quarterly workflows.
 */

import { Queue, Worker } from "bullmq";
import {
  buildQuinnGraph,
  runDailyBriefing,
  runWeeklyReport,
  runWeeklyPriorities,
  runQuarterlyPlanning,
  chatWithQuinn,
  isLinkedInConfigured,
  getLinkedInPageAnalytics,
  pushApprovalsToTelegram,
  pushFindingsToTelegram,
} from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";
import type { AgentReport } from "@quinn/shared";
import { getRedis } from "@quinn/shared";

const QUEUE_NAME = "quinn-scheduler";

export async function createScheduler() {
  const connection = getRedis();

  const queue = new Queue(QUEUE_NAME, { connection: connection as any });

  // ---- Register Cron Schedules ----

  // Daily briefing — every day at 8:00 AM
  await queue.upsertJobScheduler(
    "daily-briefing",
    { pattern: "0 8 * * *" },
    { name: "daily-briefing", data: { workflow: "daily-briefing" } },
  );

  // Morning research sweep — every day at 6:00 AM (before briefing)
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

  // Content generation — every day at 7:30 AM
  await queue.upsertJobScheduler(
    "content-generation",
    { pattern: "30 7 * * *" },
    { name: "content-generation", data: { workflow: "content-generation" } },
  );

  // LinkedIn post — every day at 10:00 AM (publish daily social content)
  await queue.upsertJobScheduler(
    "linkedin-daily-post",
    { pattern: "0 10 * * *" },
    { name: "linkedin-daily-post", data: { workflow: "linkedin-daily-post" } },
  );

  // LinkedIn monitoring — every day at 6:00 PM (check engagement)
  await queue.upsertJobScheduler(
    "linkedin-monitor",
    { pattern: "0 18 * * *" },
    { name: "linkedin-monitor", data: { workflow: "linkedin-monitor" } },
  );

  // Follow-up check — hourly during business hours (9 AM - 6 PM)
  await queue.upsertJobScheduler(
    "follow-up-check",
    { pattern: "0 9-18 * * *" },
    { name: "follow-up-check", data: { workflow: "follow-up-check" } },
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
  console.log("   • Research sweep:        0 6 * * *");
  console.log("   • Analytics snapshot:    0 7 * * *");
  console.log("   • Content generation:    30 7 * * *");
  console.log("   • Daily briefing:        0 8 * * *");
  console.log("   • LinkedIn daily post:   0 10 * * *");
  console.log("   • LinkedIn monitor:      0 18 * * *");
  console.log("   • Follow-up check:       0 9-18 * * * (hourly)");
  console.log("   • Weekly priorities:     0 9 * * 1");
  console.log("   • Weekly report:         0 17 * * 5");
  console.log("   • Quarterly planning:    0 9 1 1,4,7,10 *");

  return { queue };
}

export async function createWorker() {
  const connection = getRedis();

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
          case "analytics-snapshot":
            result = await chatWithQuinn(graph, "Run the analytics snapshot. Ask Beacon to review all KPIs, check quarterly goal progress, and flag any anomalies or metrics behind target.", undefined, onStep) as unknown as Record<string, unknown>;
            break;
          case "content-generation":
            result = await chatWithQuinn(graph, "Run morning content generation. Ask Nova to review the content calendar, generate a LinkedIn post for today, generate any content due soon, and create draft content for the rest of this week. Submit all content for approval.", undefined, onStep) as unknown as Record<string, unknown>;
            await pushApprovalsToTelegram();
            break;
          case "linkedin-daily-post": {
            if (isLinkedInConfigured()) {
              result = await chatWithQuinn(graph, "Daily LinkedIn content generation. Ask Nova to review the content calendar, check get_linkedin_analytics for recent post performance, and generate a LinkedIn post for today about Dermaqea's mission, a counterfeit awareness tip, or an industry insight. Create the content item and submit it for approval via create_approval — never publish directly.", undefined, onStep) as unknown as Record<string, unknown>;
              await pushApprovalsToTelegram();
            } else {
              console.log("  ⏭️ LinkedIn not configured — skipping daily post");
            }
            break;
          }
          case "linkedin-monitor": {
            if (isLinkedInConfigured()) {
              const analytics = await getLinkedInPageAnalytics();
              console.log(`  📊 LinkedIn analytics — followers: ${analytics.followers}, engagement: ${analytics.engagement}, impressions: ${analytics.impressions}`);
              if (analytics.engagement > 0) {
                result = await chatWithQuinn(graph, `LinkedIn daily performance check. Today's analytics: ${JSON.stringify(analytics)}. Ask Beacon to log this as an analytics snapshot. If engagement is low, suggest content strategy adjustments.`, undefined, onStep) as unknown as Record<string, unknown>;
              }
            } else {
              console.log("  ⏭️ LinkedIn not configured — skipping monitoring");
            }
            break;
          }
          case "follow-up-check":
            result = await chatWithQuinn(graph, "Run a follow-up check. Ask Iris to review all relationships for overdue follow-ups, expiring opportunities, and CRM items needing attention today.", undefined, onStep) as unknown as Record<string, unknown>;
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
