/**
 * Quinn Telegram Bot
 *
 * Primary interface for the CEO. Handles daily briefings,
 * approval workflows, status checks, and ad-hoc queries.
 */

import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { prisma } from "@quinn/database";
import type { QuinnGraph } from "../graph.js";
import { chatWithQuinn } from "../workflows/index.js";



const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowed(ctx: Context): boolean {
  if (ALLOWED_USERS.length === 0) return true;
  const userId = ctx.from?.id.toString();
  const username = ctx.from?.username;
  const allowed = ALLOWED_USERS.includes(userId ?? "") || ALLOWED_USERS.includes(username ?? "");
  if (!allowed) {
    console.warn(`⛔ Unauthorized access attempt: id=${userId} username=${username}`);
  }
  return allowed;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function createTelegramBot(graph: QuinnGraph): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.");
    return null;
  }

  const bot = new Telegraf(token);

  // ---- Middleware ----
  bot.use((ctx, next) => {
    if (!isAllowed(ctx)) {
      return ctx.reply("⛔ Unauthorized. You are not on the allowed users list.");
    }
    return next();
  });

  // ---- /start ----
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id.toString();
    const username = ctx.from?.username ?? "unknown";
    console.log(`📱 Telegram user connected: id=${userId} username=${username}`);
    await ctx.reply(
      `👋 *Welcome to Quinn!*

Quinn is your AI Chief Marketing Officer for Dermaqea. I work 24/7 researching, planning, creating, and analyzing.

Send /help to see all commands.

_Your user ID: ${userId}_`,
      { parse_mode: "Markdown" },
    );
  });

  // ---- /help ----
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `🤖 *Quinn — AI CMO Commands*

/help — Show this message
/today — Today's executive briefing
/approvals — Show pending approvals
/approve <id> — Approve a pending item
/reject <id> [reason] — Reject a pending item
/research — Latest research summary
/kpis — Key marketing KPIs
/status — All agent statuses
/ask <question> — Ask Quinn anything

_Quinn also sends daily briefings at 8 AM and alerts as they happen._`,
      { parse_mode: "Markdown" },
    );
  });

  // ---- /today ----
  bot.command("today", async (ctx) => {
    await ctx.reply("📋 Generating today's executive briefing...");

    try {
      const briefing = await prisma.briefing.findFirst({
        orderBy: { date: "desc" },
        take: 1,
      });

      if (!briefing) {
        await ctx.reply("No briefing available yet. Trigger one with /ask 'Run daily briefing'");
        return;
      }

      const pendingCount = await prisma.approval.count({ where: { status: "PENDING" } });
      const lines = [
        `📋 *Executive Briefing — ${formatDate(briefing.date)}*`,
        "",
        briefing.summary.slice(0, 3000),
        "",
        pendingCount > 0 ? `⏳ *${pendingCount} pending approvals* — /approvals to review` : "✅ No pending approvals",
        "",
        "_Last updated: " + briefing.date.toLocaleString() + "_",
      ];

      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error fetching briefing: ${(error as Error).message}`);
    }
  });

  // ---- /approvals ----
  bot.command("approvals", async (ctx) => {
    try {
      const approvals = await prisma.approval.findMany({
        where: { status: "PENDING" },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 10,
      });

      if (approvals.length === 0) {
        await ctx.reply("✅ No pending approvals. All clear!");
        return;
      }

      for (const a of approvals) {
        const priorityLabel =
          a.priority === "CRITICAL" ? "🔴" : a.priority === "HIGH" ? "🟠" : a.priority === "MEDIUM" ? "🟡" : "⚪";

        const lines = [
          `${priorityLabel} *Approval #${a.id.slice(0, 8)}* — ${a.title}`,
          ``,
          `*Type:* ${a.type}`,
          `*From:* ${a.agentName}`,
          `*Confidence:* ${a.confidence}%`,
          `*Reasoning:* ${a.reasoning ?? "N/A"}`,
          a.impact ? `*Impact:* ${a.impact}` : "",
          a.description ? `\n${a.description.slice(0, 500)}` : "",
        ];

        const buttons = [];
        buttons.push(Markup.button.callback("✅ Approve", `approve:${a.id}`));
        buttons.push(Markup.button.callback("❌ Reject", `reject:${a.id}`));
        if (a.content) buttons.push(Markup.button.callback("📄 View", `view:${a.id}`));
        const keyboard = Markup.inlineKeyboard([buttons]);

        await ctx.reply(lines.filter(Boolean).join("\n"), {
          parse_mode: "Markdown",
          ...keyboard,
        });
      }
    } catch (error) {
      await ctx.reply(`❌ Error fetching approvals: ${(error as Error).message}`);
    }
  });

  // ---- /approve <id> ----
  bot.command("approve", async (ctx) => {
    const text = ctx.message.text;
    const id = text.split(" ").slice(1).join(" ").trim();
    if (!id) {
      await ctx.reply("Usage: /approve <approval_id>");
      return;
    }
    await handleApproval(ctx as any, id, "APPROVED");
  });

  // ---- /reject <id> [reason] ----
  bot.command("reject", async (ctx) => {
    const text = ctx.message.text;
    const parts = text.split(" ").slice(1);
    const id = parts[0] ?? "";
    const reason = parts.slice(1).join(" ") || undefined;
    if (!id) {
      await ctx.reply("Usage: /reject <approval_id> [reason]");
      return;
    }
    await handleApproval(ctx as any, id, "REJECTED", reason ?? "");
  });

  // ---- Inline Keyboard Callbacks ----
  bot.action(/approve:(.+)/, async (ctx) => {
    const id = ctx.match[1] as string;
    await ctx.answerCbQuery("Approving...");
    await handleApproval(ctx as any, id, "APPROVED");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  bot.action(/reject:(.+)/, async (ctx) => {
    const id = ctx.match[1] as string;
    await ctx.answerCbQuery("Rejecting...");
    await handleApproval(ctx as any, id, "REJECTED");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  bot.action(/view:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    await ctx.answerCbQuery();
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      await ctx.reply("Approval not found.");
      return;
    }
    const content = typeof approval.content === "string" ? approval.content : JSON.stringify(approval.content, null, 2);
    await ctx.reply(`📄 *${approval.title}*\n\n${content.slice(0, 3500)}`, {
      parse_mode: "Markdown",
    });
  });

  // ---- /research ----
  bot.command("research", async (ctx) => {
    try {
      const orgs = await prisma.organization.findMany({
        orderBy: { priorityScore: "desc" },
        take: 10,
        select: { name: true, industry: true, priorityScore: true, outreachStatus: true },
      });

      const opps = await prisma.opportunity.findMany({
        where: { status: "IDENTIFIED" as any },
        orderBy: { probability: "desc" },
        take: 10,
        select: { title: true, type: true, deadline: true, probability: true },
      });

      const lines = ["🔬 *Latest Research*", ""];

      if (orgs.length > 0) {
        lines.push("*Top Organizations:*");
        for (const o of orgs) {
          const status = o.outreachStatus === "CONTACTED" ? "📞" : o.outreachStatus === "RESEARCHING" ? "🔍" : "📌";
          lines.push(`${status} ${o.name} — ${o.industry ?? "N/A"} (score: ${o.priorityScore})`);
        }
        lines.push("");
      }

      if (opps.length > 0) {
        lines.push("*Open Opportunities:*");
        for (const o of opps) {
          const deadline = o.deadline ? `due ${formatDate(o.deadline)}` : "";
          lines.push(`🎯 ${o.title} (${o.type}) — ${o.probability}% ${deadline}`);
        }
        lines.push("");
      }

      if (orgs.length === 0 && opps.length === 0) {
        lines.push("No research data yet. Ask Quinn to research.");
      }

      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  });

  // ---- /kpis ----
  bot.command("kpis", async (ctx) => {
    try {
      const snapshots = await prisma.analyticsSnapshot.findMany({
        orderBy: { date: "desc" },
        take: 1,
      });

      const goals = await prisma.quarterlyGoal.findMany({
        include: { keyResults: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      const lines = ["📊 *Marketing KPIs*", ""];

      if (snapshots.length > 0) {
        const snap = snapshots[0];
        if (snap) {
          const metrics = snap.metrics as Record<string, number | string> | null;
          if (metrics) {
            for (const [key, val] of Object.entries(metrics)) {
              lines.push(`• *${key}:* ${val}`);
            }
          }
          lines.push(`_Snapshot from ${formatDate(snap.date)}_`);
        }
        lines.push("");
      }

      if (goals.length > 0) {
        lines.push("*Quarterly Goals:*");
        for (const g of goals) {
          const progress = g.keyResults.length > 0
            ? g.keyResults.map((kr) => `${kr.title}: ${kr.currentValue}/${kr.targetValue} ${kr.unit}`).join("\n  ")
            : "No key results yet";
          lines.push(`• ${g.title} (${g.progress}%)`);
          lines.push(`  ${progress}`);
        }
      }

      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  });

  // ---- /status ----
  bot.command("status", async (ctx) => {
    try {
      const orgCount = await prisma.organization.count();
      const contactCount = await prisma.contact.count();
      const oppCount = await prisma.opportunity.count();
      const contentCount = await prisma.contentItem.count();
      const pendingCount = await prisma.approval.count({ where: { status: "PENDING" } });
      const recentLogs = await prisma.agentLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
      });

      const lines = [
        "🤖 *Quinn System Status*",
        "",
        "*Agent Activity (recent):*",
      ];

      for (const log of recentLogs) {
        lines.push(`• ${log.agentName}: ${log.action.slice(0, 60)}`);
      }

      lines.push(
        "",
        "*Data Summary:*",
        `• 🏢 ${orgCount} organizations`,
        `• 👤 ${contactCount} contacts`,
        `• 🎯 ${oppCount} opportunities`,
        `• 📝 ${contentCount} content items`,
        `• ⏳ ${pendingCount} pending approvals`,
        "",
        `_Last updated: ${new Date().toLocaleString()}_`,
      );

      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  });

  // ---- /ask <question> ----
  bot.command("ask", async (ctx) => {
    const question = ctx.message.text.split(" ").slice(1).join(" ").trim();
    if (!question) {
      await ctx.reply("Usage: /ask <your question>");
      return;
    }

    await ctx.reply("🤔 Let me think about that...");

    try {
      const result = await chatWithQuinn(graph, question);
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() ?? "No response generated.";
      await ctx.reply(answer.slice(0, 4000), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  });

  // ---- Simple test ----
  bot.command("ping", async (ctx) => {
    await ctx.reply("pong");
  });

  // ---- Fallback: treat any text as an ask ----
  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    await ctx.reply("🤔 Processing your request...");

    try {
      const result = await chatWithQuinn(graph, text);
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() ?? "No response generated.";
      await ctx.reply(answer.slice(0, 4000), { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`❌ Error: ${(error as Error).message}`);
    }
  });

  bot.catch((err, ctx) => {
    console.error(`❌ Telegram bot error [${ctx?.updateType}]:`, err);
  });

  return bot;
}

// ---- Shared Approval Handler ----
async function handleApproval(
  ctx: any,
  id: string,
  status: "APPROVED" | "REJECTED",
  reason?: string,
) {
  try {
    const approval = await prisma.approval.findUnique({ where: { id } });
    if (!approval) {
      await ctx.reply(`Approval ${id.slice(0, 8)} not found.`);
      return;
    }
    if (approval.status !== "PENDING") {
      await ctx.reply(`Approval ${id.slice(0, 8)} was already ${approval.status.toLowerCase()}.`);
      return;
    }

    await prisma.approval.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewNotes: reason ?? null,
      },
    });

    const label = status === "APPROVED" ? "✅ Approved" : "❌ Rejected";
    await ctx.reply(`${label} *${approval.title}*${reason ? `\nReason: ${reason}` : ""}`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    await ctx.reply(`❌ Error processing approval: ${(error as Error).message}`);
  }
}
