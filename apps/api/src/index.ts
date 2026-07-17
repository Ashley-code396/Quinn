/**
 * Quinn API Server
 *
 * Express REST API + WebSocket server for the Quinn dashboard.
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "@quinn/database";
import { buildQuinnGraph, chatWithQuinn, createTelegramBot } from "@quinn/agents";
import type { QuinnGraph } from "@quinn/agents";
import { createScheduler, createWorker, triggerWorkflow } from "@quinn/scheduler";
import type { Queue } from "bullmq";
import { executeApprovedAction } from "@quinn/agents";

const app = express();
const PORT = parseInt(process.env.API_PORT ?? "4000", 10);

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
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", agent: "quinn", timestamp: new Date() });
});

// ---- Briefings ----
app.get("/api/briefings", async (_req, res) => {
  const briefings = await prisma.briefing.findMany({
    orderBy: { date: "desc" },
    take: 20,
  });
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
  res.json(approval);
});

// ---- Organizations ----
app.get("/api/organizations", async (req, res) => {
  const { industry, status, search, limit } = req.query;
  const orgs = await prisma.organization.findMany({
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
  });
  res.json(orgs);
});

// ---- Content ----
app.get("/api/content", async (req, res) => {
  const { type, status, limit } = req.query;
  const items = await prisma.contentItem.findMany({
    where: {
      ...(type && { type: type as never }),
      ...(status && { status: status as never }),
    },
    orderBy: { createdAt: "desc" },
    take: parseInt((limit as string) ?? "50", 10),
  });
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
  const opps = await prisma.opportunity.findMany({
    where: {
      ...(type && { type: type as never }),
      ...(status && { status: status as never }),
    },
    include: { organization: { select: { name: true, id: true } } },
    orderBy: { probability: "desc" },
    take: parseInt((limit as string) ?? "50", 10),
  });
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
  const snapshots = await prisma.analyticsSnapshot.findMany({
    orderBy: { date: "desc" },
    take: 30,
  });
  const pendingApprovals = await prisma.approval.count({ where: { status: "PENDING" } });
  const totalOrgs = await prisma.organization.count();
  const totalContent = await prisma.contentItem.count();
  const totalOpps = await prisma.opportunity.count();

  res.json({
    snapshots,
    summary: { pendingApprovals, totalOrgs, totalContent, totalOpps },
  });
});

// ---- Goals / OKRs ----
app.get("/api/goals", async (req, res) => {
  const { quarter } = req.query;
  const goals = await prisma.quarterlyGoal.findMany({
    where: quarter ? { quarter: quarter as string } : {},
    include: { keyResults: true, initiatives: true },
    orderBy: { createdAt: "desc" },
  });
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
  broadcast("workflow:started", { workflow, jobId });
  res.json({ jobId, workflow, status: "queued" });
});

// ---- Agent Logs ----
app.get("/api/logs", async (req, res) => {
  const { agent, limit } = req.query;
  const logs = await prisma.agentLog.findMany({
    where: agent ? { agentName: agent as never } : {},
    orderBy: { createdAt: "desc" },
    take: parseInt((limit as string) ?? "50", 10),
  });
  res.json(logs);
});

// ---- Startup ----
async function start() {
  console.log("\n🚀 Starting Quinn API Server...\n");

  // Initialize the Quinn graph
  graph = await buildQuinnGraph();
  console.log("  ✅ Quinn agent graph compiled");

  // Initialize scheduler
  const scheduler = await createScheduler();
  schedulerQueue = scheduler.queue;
  console.log("  ✅ Scheduler initialized");

  // Start scheduler worker
  await createWorker();
  console.log("  ✅ Scheduler worker started");

  // Start Telegram bot
  const telegramBot = createTelegramBot(graph);
  if (telegramBot) {
    telegramBot.launch({ dropPendingUpdates: true }).then(() => {
      console.log("  ✅ Telegram bot started — polling Telegram API");
    }).catch((err) => {
      console.error("  ❌ Telegram bot failed to start:", err);
    });
  }

  // Start HTTP server
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
