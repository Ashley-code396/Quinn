/**
 * Quinn Standalone Test Runner
 *
 * Runs any workflow independently without the API server.
 * Usage: tsx src/run.ts <workflow> [message]
 *
 * Workflows:
 *   daily-briefing      Run the daily executive briefing
 *   weekly-report       Run the weekly performance report
 *   weekly-priorities   Run the weekly priorities
 *   quarterly-planning  Run the quarterly planning
 *   chat <message>      Ad-hoc chat with Quinn
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import {
  buildQuinnGraph,
  runDailyBriefing,
  runWeeklyReport,
  runWeeklyPriorities,
  runQuarterlyPlanning,
  chatWithQuinn,
} from "./index.js";

async function main() {
  const args = process.argv.slice(2);
  const workflow = args[0];

  if (!workflow || workflow === "--help" || workflow === "-h") {
    console.log(`
Quinn Agent Test Runner

Usage:
  tsx src/run.ts <workflow> [message]

Workflows:
  daily-briefing      Run the daily executive briefing
  weekly-report       Run the weekly performance report
  weekly-priorities   Run the weekly priorities
  quarterly-planning  Run the quarterly planning
  chat <message>      Ad-hoc chat with Quinn

Examples:
  tsx src/run.ts daily-briefing
  tsx src/run.ts chat "What should our top priority be?"
`);
    process.exit(0);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY in environment");
    process.exit(1);
  }

  console.log(`\n🤖 Building Quinn agent graph...`);
  const graph = await buildQuinnGraph();

  console.log(`\n🚀 Running workflow: ${workflow}\n`);
  const startTime = Date.now();

  let result;
  switch (workflow) {
    case "daily-briefing":
      result = await runDailyBriefing(graph);
      break;
    case "weekly-report":
      result = await runWeeklyReport(graph);
      break;
    case "weekly-priorities":
      result = await runWeeklyPriorities(graph);
      break;
    case "quarterly-planning":
      result = await runQuarterlyPlanning(graph);
      break;
    case "chat": {
      const message = args.slice(1).join(" ");
      if (!message) {
        console.error("Usage: tsx src/run.ts chat \"<your message>\"");
        process.exit(1);
      }
      result = await chatWithQuinn(graph, message);
      break;
    }
    default:
      console.error(`Unknown workflow: ${workflow}`);
      console.log(`Valid: daily-briefing, weekly-report, weekly-priorities, quarterly-planning, chat`);
      process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  const msgs = (result as Record<string, unknown>).messages as any[];
  const lastMessage = msgs[msgs.length - 1];
  const output = lastMessage?.content?.toString() ?? "No response";

  console.log(`\n${"=".repeat(72)}`);
  console.log(`✅ Workflow "${workflow}" completed in ${duration}s`);
  console.log(`${"=".repeat(72)}\n`);
  console.log(output);
  console.log(`\n${"=".repeat(72)}\n`);
}

async function runWithRetry(fn: () => Promise<void>, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.status === 429;
      if (isRateLimit && attempt < retries) {
        const wait = attempt * 15;
        console.log(`\n⏳ Rate limited. Retrying in ${wait}s (attempt ${attempt}/${retries})...\n`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
}

runWithRetry(main).catch((err) => {
  console.error("\n❌ Quinn run failed:", err);
  process.exit(1);
});
