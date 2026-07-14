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
} from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";

const QUEUE_NAME = "quinn-scheduler";

export async function createScheduler(redisUrl?: string) {
  const connection = new Redis(redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue(QUEUE_NAME, { connection: connection as any });

  // ---- Register Cron Schedules ----

  // Daily briefing — every day at 8:00 AM
  await queue.upsertJobScheduler(
    "daily-briefing",
    { pattern: "0 8 * * *" },
    { name: "daily-briefing", data: { workflow: "daily-briefing" } },
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
  console.log("   • Daily briefing:     0 8 * * *");
  console.log("   • Weekly priorities:  0 9 * * 1");
  console.log("   • Weekly report:      0 17 * * 5");
  console.log("   • Quarterly planning: 0 9 1 1,4,7,10 *");

  return { queue, connection };
}

export async function createWorker(redisUrl?: string) {
  const connection = new Redis(redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  // Build the graph once for the worker
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
          case "weekly-report":
            await runWeeklyReport(graph);
            break;
          case "weekly-priorities":
            await runWeeklyPriorities(graph);
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
