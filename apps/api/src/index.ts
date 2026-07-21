/**
 * Quinn API Server
 *
 * Express REST API + WebSocket server for the Quinn dashboard.
 * Redeploy trigger: add /trigger telegram command support.
 */

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "@quinn/database";
import { buildQuinnGraph, chatWithQuinn, createTelegramBot, pushApprovalsToTelegram } from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";
import { createScheduler, createWorker, triggerWorkflow } from "@quinn/scheduler";
import type { Queue } from "bullmq";
import { executeApprovedAction } from "@quinn/agents";
import { cacheGet, cacheDel, cacheInvalidate, closeRedis } from "@quinn/shared";

const app = express();
const PORT = parseInt(process.env.PORT ?? process.env.API_PORT ?? "4000", 10);

app.use(cors());
app.use(express.json());

// ---- Globals ----
let graph: QuinnGraph;
let schedulerQueue: Queue;

// ---- WebSocket ----
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

function broadcast(type: string, payload: unknown) {
  const msg = JSON.stringify({ type, payload, timestamp: new Date() });
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ---- Health ----
app.get("/api/health", async (_req, res) => {
  const dbOk = await (async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch { return false; }
  })();

  if (!dbOk) return res.status(503).json({ status: "error", database: "disconnected" });
  res.json({ status: "ok", agent: "quinn", database: "connected", timestamp: new Date() });
});

// ---- Briefings ----
app.get("/api/briefings", async (_req, res) => {
  const briefings = await cacheGet(
    ["briefings", "list"],
    () => prisma.briefing.findMany({ orderBy: { date: "desc" }, take: 20 }),
    30,
  );
  res.json(briefings);
});

app.get("/api/briefings/:id", async (req, res) => {
  const briefing = await prisma.briefing.findUnique({ where: { id: req.params.id } });
  if (!briefing) return res.status(404).json({ error: "Not found" });
  res.json(briefing);
});

// ---- Approvals ----
app.get("/api/approvals", async (req, res) => {
  const status = (req.query.status as string) ?? "PENDING";
  const approvals = await prisma.approval.findMany({
    where: status === "ALL" ? {} : { status: status as never },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
  res.json(approvals);
});

app.post("/api/approvals/:id/approve", async (req, res) => {
  const approval = await prisma.approval.update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewNotes: req.body.notes ?? null,
    },
  });
  broadcast("approval:updated", approval);
  cacheDel("analytics", "summary").catch(() => {});
  executeApprovedAction(req.params.id).catch((err) => console.error("Post-approval execution failed:", err));
  res.json(approval);
});

app.post("/api/approvals/:id/reject", async (req, res) => {
  const approval = await prisma.approval.update({
    where: { id: req.params.id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewNotes: req.body.notes ?? null,
    },
  });
  broadcast("approval:updated", approval);
  cacheDel("analytics", "summary").catch(() => {});
  res.json(approval);
});

// ---- Organizations ----
app.get("/api/organizations", async (req, res) => {
  const { industry, status, search, limit } = req.query;
  const cacheSegments: string[] = ["orgs", (industry as string) || "all", (status as string) || "all", (search as string) || "none", (limit as string) || "50"];
  const orgs = await cacheGet(
    cacheSegments,
    () => prisma.organization.findMany({
      where: {
        ...(industry && { industry: { contains: industry as string, mode: "insensitive" as const } }),
        ...(status && { outreachStatus: status as never }),
        ...(search && {
          OR: [
            { name: { contains: search as string, mode: "insensitive" as const } },
            { industry: { contains: search as string, mode: "insensitive" as const } },
          ],
        }),
      },
      orderBy: { priorityScore: "desc" },
      take: parseInt((limit as string) ?? "50", 10),
    }),
    60,
  );
  res.json(orgs);
});

// ---- Content ----
app.get("/api/content", async (req, res) => {
  const { type, status, limit } = req.query;
  const cacheSegments: string[] = ["content", (type as string) || "all", (status as string) || "all", (limit as string) || "50"];
  const items = await cacheGet(
    cacheSegments,
    () => prisma.contentItem.findMany({
      where: {
        ...(type && { type: type as never }),
        ...(status && { status: status as never }),
      },
      orderBy: { createdAt: "desc" },
      take: parseInt((limit as string) ?? "50", 10),
    }),
    60,
  );
  res.json(items);
});

app.get("/api/content/calendar", async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m = parseInt((month as string) ?? String(now.getMonth() + 1), 10);
  const y = parseInt((year as string) ?? String(now.getFullYear()), 10);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59);
  const entries = await prisma.contentCalendarEntry.findMany({
    where: { date: { gte: start, lte: end } },
    include: { contentItem: { select: { title: true, status: true, type: true } } },
    orderBy: { date: "asc" },
  });
  res.json(entries);
});

// ---- Opportunities ----
app.get("/api/opportunities", async (req, res) => {
  const { type, status, limit } = req.query;
  const cacheSegments: string[] = ["opps", (type as string) || "all", (status as string) || "all", (limit as string) || "50"];
  const opps = await cacheGet(
    cacheSegments,
    () => prisma.opportunity.findMany({
      where: {
        ...(type && { type: type as never }),
        ...(status && { status: status as never }),
      },
      include: { organization: { select: { name: true, id: true } } },
      orderBy: { probability: "desc" },
      take: parseInt((limit as string) ?? "50", 10),
    }),
    60,
  );
  res.json(opps);
});

// ---- Relationships ----
app.get("/api/relationships", async (req, res) => {
  const { stage } = req.query;
  const rels = await prisma.relationship.findMany({
    where: stage ? { stage: stage as never } : {},
    include: {
      organization: { select: { name: true, id: true } },
      contact: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json(rels);
});

// ---- Analytics ----
app.get("/api/analytics", async (_req, res) => {
  const data = await cacheGet(
    ["analytics", "summary"],
    async () => {
      const [snapshots, pendingApprovals, totalOrgs, totalContent, totalOpps] = await Promise.all([
        prisma.analyticsSnapshot.findMany({ orderBy: { date: "desc" }, take: 30 }),
        prisma.approval.count({ where: { status: "PENDING" } }),
        prisma.organization.count(),
        prisma.contentItem.count(),
        prisma.opportunity.count(),
      ]);
      return { snapshots, summary: { pendingApprovals, totalOrgs, totalContent, totalOpps } };
    },
    30,
  );
  res.json(data);
});

// ---- Goals / OKRs ----
app.get("/api/goals", async (req, res) => {
  const { quarter } = req.query;
  const cacheSegments: string[] = ["goals", (quarter as string) || "current"];
  const goals = await cacheGet(
    cacheSegments,
    () => prisma.quarterlyGoal.findMany({
      where: quarter ? { quarter: quarter as string } : {},
      include: { keyResults: true, initiatives: true },
      orderBy: { createdAt: "desc" },
    }),
    120,
  );
  res.json(goals);
});

// ---- Quinn Chat ----
app.post("/api/quinn/chat", async (req, res) => {
  const { message, threadId } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });

  try {
    const result = await chatWithQuinn(graph, message, threadId);
    const lastMessage = result.messages[result.messages.length - 1];
    broadcast("agent:status", { agent: "quinn", status: "completed" });
    res.json({
      response: lastMessage?.content?.toString() ?? "No response",
      threadId: threadId ?? "new",
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Quinn encountered an error" });
  }
});

// ---- Workflow Triggers ----
app.post("/api/quinn/trigger/:workflow", async (req, res) => {
  const { workflow } = req.params;
  const validWorkflows = ["daily-briefing", "weekly-priorities", "weekly-report", "quarterly-planning"];
  if (!validWorkflows.includes(workflow)) {
    return res.status(400).json({ error: `Invalid workflow. Valid: ${validWorkflows.join(", ")}` });
  }
  const jobId = await triggerWorkflow(schedulerQueue, workflow);
  cacheInvalidate("*").catch(() => {});
  broadcast("workflow:started", { workflow, jobId });
  pushApprovalsToTelegram().catch(() => {});
  res.json({ jobId, workflow, status: "queued" });
});

// ---- Agent Logs ----
app.get("/api/logs", async (req, res) => {
  const { agent, limit } = req.query;
  const cacheSegments: string[] = ["logs", (agent as string) || "all", (limit as string) || "50"];
  const logs = await cacheGet(
    cacheSegments,
    () => prisma.agentLog.findMany({
      where: agent ? { agentName: agent as never } : {},
      orderBy: { createdAt: "desc" },
      take: parseInt((limit as string) ?? "50", 10),
    }),
    30,
  );
  res.json(logs);
});

// ---- Error handler ----
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ---- Startup ----
async function start() {
  if (!process.env.GROQ_API_KEY) {
    console.error("FATAL: GROQ_API_KEY is not set. Agents cannot function.");
    process.exit(1);
  }

  console.log("\n🚀 Starting Quinn API Server...\n");

  graph = await buildQuinnGraph();
  console.log("  ✅ Quinn agent graph compiled");

  try {
    const scheduler = await createScheduler();
    schedulerQueue = scheduler.queue;
    console.log("  ✅ Scheduler initialized");
  } catch (err) {
    console.error("  ⚠️ Scheduler initialization failed (non-fatal):", (err as Error).message);
  }

  try {
    await createWorker();
    console.log("  ✅ Scheduler worker started");
  } catch (err) {
    console.error("  ⚠️ Scheduler worker failed (non-fatal):", (err as Error).message);
  }

  const telegramBot = createTelegramBot(graph);
  if (telegramBot) {
    const launchWithRetry = async (retries = 5, delay = 2_000): Promise<void> => {
      for (let i = 0; i < retries; i++) {
        try {
          await telegramBot.launch({ dropPendingUpdates: true });
          console.log("  ✅ Telegram bot started — polling Telegram API");
          return;
        } catch (err) {
          const isLast = i === retries - 1;
          console.error(`  ${isLast ? "❌" : "⚠️"} Telegram bot attempt ${i + 1}/${retries} failed: ${(err as Error).message}`);
          if (isLast) {
            console.error("  ❌ Telegram bot failed to start after all retries.");
            return;
          }
          await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
        }
      }
    };
    launchWithRetry().catch((err) => console.error("Telegram bot launch error:", err));
  }

  server.listen(PORT, () => {
    console.log(`\n🌐 Quinn API running at http://localhost:${PORT}`);
    console.log(`📡 WebSocket at ws://localhost:${PORT}/ws`);
    console.log("\n👩‍💼 Quinn is ready to work.\n");
  });
}

start().catch((err) => {
  console.error("Failed to start Quinn:", err);
  process.exit(1);
});

// ---- Graceful shutdown ----
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close();
  await closeRedis().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
