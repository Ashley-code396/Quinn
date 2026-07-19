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
} from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";
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
  console.log("   • Research sweep:     0 6 * * *");
  console.log("   • Analytics snapshot: 0 7 * * *");
  console.log("   • Content generation: 30 7 * * *");
  console.log("   • Daily briefing:     0 8 * * *");
  console.log("   • Follow-up check:    0 9-18 * * * (hourly)");
  console.log("   • Weekly priorities:  0 9 * * 1");
  console.log("   • Weekly report:      0 17 * * 5");
  console.log("   • Quarterly planning: 0 9 1 1,4,7,10 *");

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

      try {
        switch (job.data.workflow) {
          case "daily-briefing":
            await runDailyBriefing(graph);
            break;
          case "research-sweep":
            await chatWithQuinn(graph, "Run a morning research sweep. Ask Sage to search for new industry developments, competitor news, and emerging opportunities. Store any findings.");
            break;
          case "analytics-snapshot":
            await chatWithQuinn(graph, "Run the analytics snapshot. Ask Beacon to review all KPIs, check quarterly goal progress, and flag any anomalies or metrics behind target.");
            break;
          case "content-generation":
            await chatWithQuinn(graph, "Run morning content generation. Ask Nova to review the content calendar, generate any content due soon, and create draft LinkedIn posts for this week.");
            break;
          case "follow-up-check":
            await chatWithQuinn(graph, "Run a follow-up check. Ask Iris to review all relationships for overdue follow-ups, expiring opportunities, and CRM items needing attention today.");
            break;
          case "weekly-report":
            await runWeeklyReport(graph);
            break;
          case "weekly-priorities":
            await runWeeklyPriorities(graph);
            break;
          case "quarterly-planning":
            await runQuarterlyPlanning(graph);
            break;
          default:
            console.warn(`Unknown workflow: ${job.data.workflow}`);
        }

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
