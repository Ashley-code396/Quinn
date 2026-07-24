import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { BaseMessage } from "@langchain/core/messages";
import { prisma } from "@quinn/database";
import type { QuinnGraph } from "../graph.js";
import type { AgentReport, Recommendation, Alert } from "@quinn/shared";
import { chatWithQuinn, runDailyBriefing, runWeeklyReport, runWeeklyPriorities, runQuarterlyPlanning } from "../workflows/index.js";
import { isRedisMemoryConfigured, storeSessionEvent } from "../memory/index.js";
import { executeApprovedAction } from "../executor/index.js";

let botInstance: Telegraf | null = null;
let authorizedChatId: string | null = null;

function getAgentEmoji(name: string): string {
  const map: Record<string, string> = {
    sage: "🔬",
    nova: "✍️",
    atlas: "🚀",
    iris: "🤝",
    helix: "🎨",
    beacon: "📊",
    quinn: "🧠",
  };
  return map[name.toLowerCase()] ?? "📋";
}

function sanitizeMarkdown(text: string): string {
  let result = text;
  if ((result.match(/\*\*/g)?.length ?? 0) % 2 !== 0) result += "**";
  const withoutBold = result.replace(/\*\*/g, "");
  if ((withoutBold.match(/(?<!\*)\*(?!\*)/g)?.length ?? 0) % 2 !== 0) result += "*";
  if ((result.match(/`/g)?.length ?? 0) % 2 !== 0) result += "`";
  if ((result.match(/~/g)?.length ?? 0) % 2 !== 0) result += "~";
  if ((result.match(/_/g)?.length ?? 0) % 2 !== 0) result += "_";
  const openBracket = result.lastIndexOf("[");
  const closeBracket = result.lastIndexOf("]");
  const openParen = result.lastIndexOf("(");
  const closeParen = result.lastIndexOf(")");
  if (openBracket > closeBracket) result += "]";
  if (openParen > closeParen && openParen > closeBracket) result += ")";
  return result;
}

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

export async function pushApprovalsToTelegram(): Promise<void> {
  const bot = botInstance;
  const chatId = authorizedChatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
  if (!bot || !chatId) return;

  const pending = await prisma.approval.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const approval of pending) {
    const content = typeof approval.content === "string"
      ? approval.content
      : (approval.content as Record<string, unknown>)?.body as string ?? JSON.stringify(approval.content, null, 2);

    const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;

    const message = [
      `✍️ *${approval.title}*`,
      `*Agent:* ${approval.agentName}`,
      `*Priority:* ${approval.priority}`,
      `*Confidence:* ${approval.confidence}%`,
      ``,
      preview,
      ``,
      approval.reasoning ? `*Why:* ${approval.reasoning}` : "",
      approval.impact ? `*Impact:* ${approval.impact}` : "",
    ].filter(Boolean).join("\n");

    try {
      await bot.telegram.sendMessage(chatId, sanitizeMarkdown(message), {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Approve", callback_data: `approve:${approval.id}` },
              { text: "❌ Reject", callback_data: `reject:${approval.id}` },
            ],
            [
              { text: "📄 View Full Content", callback_data: `view:${approval.id}` },
            ],
          ],
        },
      });
    } catch (err) {
      console.error("Failed to push approval to Telegram:", (err as Error).message);
    }
  }
}

/**
 * Push agent findings and final briefing to Telegram after a workflow run.
 * Pass `seenReportCount` to only push reports beyond that index (for incremental streaming).
 */
export async function pushFindingsToTelegram(
  result: Record<string, unknown>,
  seenReportCount = 0,
): Promise<void> {
  const bot = botInstance;
  const chatId = authorizedChatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
  if (!bot) return;
  if (!chatId) {
    console.warn("  ⚠️ pushFindingsToTelegram: no chatId. Set TELEGRAM_CHAT_ID or message the bot first.");
    return;
  }

  const agentReports = (result.agentReports as AgentReport[] | undefined) ?? [];
  const messages = result.messages as BaseMessage[] | undefined;
  const workflowTrigger = result.trigger as string | undefined;

  const newReports = agentReports.slice(seenReportCount);

  if (newReports.length === 0 && (!messages || messages.length === 0)) return;

  if (seenReportCount === 0 && newReports.length > 0) {
    const workflowLabel = workflowTrigger
      ? workflowTrigger.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Agent Report";
    try {
      await bot.telegram.sendMessage(chatId, `📋 *${workflowLabel}*`, { parse_mode: "Markdown" });
    } catch { /* ignore header errors */ }
  }

  for (const report of newReports) {
    const emoji = getAgentEmoji(report.agentName);
    const header = `${emoji} *${report.agentName.toUpperCase()}*`;
    const summaryLine = report.summary ? `_${report.summary}_` : "";

    try {
      await bot.telegram.sendMessage(chatId, sanitizeMarkdown([header, summaryLine].filter(Boolean).join("\n")), { parse_mode: "Markdown" });
    } catch { /* skip header errors */ }

    for (const finding of report.findings.slice(0, 6)) {
      const chunks = splitIntoChunks(finding, 3900);
      for (const chunk of chunks) {
        try {
          await bot.telegram.sendMessage(chatId, sanitizeMarkdown(chunk), { parse_mode: "Markdown" });
        } catch { /* skip chunk errors */ }
      }
    }
  }

  if (!newReports.length) {
    const finalMessage = messages?.[messages.length - 1];
    const briefing = finalMessage?.content?.toString() ?? "";
    if (briefing && briefing.length > 20) {
      const chunks = splitIntoChunks(briefing, 3900);
      for (const chunk of chunks) {
        try {
          await bot.telegram.sendMessage(chatId, sanitizeMarkdown(chunk), { parse_mode: "Markdown" });
        } catch (err) {
          console.error("Failed to push briefing chunk to Telegram:", (err as Error).message);
        }
      }
    }
  }
}

export function createTelegramBot(graph: QuinnGraph): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.");
    return null;
  }

  const bot = new Telegraf(token);
  botInstance = bot;

  bot.use((ctx, next) => {
    if (!isAllowed(ctx)) {
      return ctx.reply("⛔ Unauthorized.");
    }
    return next();
  });

  const WORKFLOWS: Record<string, (g: QuinnGraph) => Promise<unknown>> = {
    "research-sweep": (g) => chatWithQuinn(g, "Run a research sweep. Ask Sage to search for new industry developments, competitor news, and emerging opportunities."),
    "analytics-snapshot": (g) => chatWithQuinn(g, "Run the analytics snapshot. Ask Beacon to review all KPIs, check quarterly goal progress, and flag any anomalies or metrics behind target."),
    "content-generation": (g) => chatWithQuinn(g, "Run morning content generation. Ask Nova to review the content calendar, generate a LinkedIn post for today, generate any content due soon, and create draft content for the rest of this week. Submit all content for approval."),
    "daily-briefing": (g) => runDailyBriefing(g),
    "follow-up-check": (g) => chatWithQuinn(g, "Run a follow-up check. Ask Iris to review all relationships for overdue follow-ups, expiring opportunities, and CRM items needing attention today."),
    "weekly-priorities": (g) => runWeeklyPriorities(g),
    "weekly-report": (g) => runWeeklyReport(g),
    "quarterly-planning": (g) => runQuarterlyPlanning(g),
  };

  bot.command("trigger", async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const workflow = args[0];
    if (!workflow || !WORKFLOWS[workflow]) {
      const list = Object.keys(WORKFLOWS).join("\n");
      await ctx.reply(`Available workflows:\n${list}\n\nUsage: /trigger <workflow>`);
      return;
    }
    await ctx.reply(`⏳ Running ${workflow}...`);
    try {
      const result = await runWorkflow(workflow);
      await ctx.reply(`✅ ${workflow} completed.`);
      if (result) await pushFindingsToTelegram(result);
      await pushApprovalsToTelegram();
    } catch (err) {
      const msg = (err as Error).message.toLowerCase();
      if (msg.includes("429") || msg.includes("rate limit")) {
        await ctx.reply("⏳ AI is rate limited. Waiting a moment before retrying...");
        await new Promise((r) => setTimeout(r, 10000));
        try {
          const result = await runWorkflow(workflow);
          await ctx.reply(`✅ ${workflow} completed (after retry).`);
          if (result) await pushFindingsToTelegram(result);
          return;
        } catch { /* fall through */ }
      }
      await ctx.reply(`❌ ${workflow} failed. Try again in a minute.`);
    }
  });

  async function runWorkflow(name: string): Promise<Record<string, unknown> | null> {
    let seenReportCount = 0;
    const onStep = async (state: Record<string, unknown>) => {
      const reports = (state.agentReports as AgentReport[] | undefined) ?? [];
      if (reports.length > seenReportCount) {
        await pushFindingsToTelegram(state, seenReportCount);
        seenReportCount = reports.length;
      }
      const messages = state.messages as BaseMessage[] | undefined;
      const last = messages?.[messages.length - 1];
      if (last?.name === "quinn" && last?.content?.toString().length > 20) {
        await pushFindingsToTelegram(state, seenReportCount);
      }
    };
    switch (name) {
      case "research-sweep":
        return await chatWithQuinn(graph, "Run a research sweep. Ask Sage to search for new industry developments, competitor news, and emerging opportunities.", undefined, onStep) as unknown as Record<string, unknown>;
      case "analytics-snapshot":
        return await chatWithQuinn(graph, "Run the analytics snapshot. Ask Beacon to review all KPIs, check quarterly goal progress, and flag any anomalies or metrics behind target.", undefined, onStep) as unknown as Record<string, unknown>;
      case "content-generation":
        return await chatWithQuinn(graph, "Run morning content generation. Ask Nova to review the content calendar, generate a LinkedIn post for today, generate any content due soon, and create draft content for the rest of this week. Submit all content for approval.", undefined, onStep) as unknown as Record<string, unknown>;
      case "daily-briefing":
        return await runDailyBriefing(graph, undefined, onStep) as unknown as Record<string, unknown>;
      case "follow-up-check":
        return await chatWithQuinn(graph, "Run a follow-up check. Ask Iris to review all relationships for overdue follow-ups, expiring opportunities, and CRM items needing attention today.", undefined, onStep) as unknown as Record<string, unknown>;
      case "weekly-priorities":
        return await runWeeklyPriorities(graph, undefined, onStep) as unknown as Record<string, unknown>;
      case "weekly-report":
        return await runWeeklyReport(graph, undefined, onStep) as unknown as Record<string, unknown>;
      case "quarterly-planning":
        return await runQuarterlyPlanning(graph, undefined, onStep) as unknown as Record<string, unknown>;
      default:
        return null;
    }
  }

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "I'm Quinn, your AI CMO. Send me a message or use /trigger <workflow> to run a scheduled workflow on demand.\n\nWorkflows:\n" +
      Object.keys(WORKFLOWS).map((w) => `  /trigger ${w}`).join("\n")
    );
  });

  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const chatId = ctx.chat?.id;
    if (chatId) authorizedChatId = String(chatId);
    const threadId = chatId ? `telegram-${chatId}` : undefined;
    const sessionId = threadId;

    if (sessionId && isRedisMemoryConfigured()) {
      storeSessionEvent({
        sessionId,
        actorId: ctx.from?.id.toString() ?? "unknown",
        role: "USER",
        text,
      }).catch(() => {});
    }

    await ctx.sendChatAction("typing");

    try {
      let seenReportCount = 0;
      const result = await chatWithQuinn(graph, text, threadId, async (state) => {
        const reports = (state.agentReports as AgentReport[] | undefined) ?? [];
        if (reports.length > seenReportCount) {
          await pushFindingsToTelegram(state, seenReportCount);
          seenReportCount = reports.length;
        }
      });
      const msgs = (result.messages as BaseMessage[]) ?? [];
      const lastMessage = msgs[msgs.length - 1];
      const answer = lastMessage?.content?.toString() ?? "";
      if (answer) {
        if (sessionId && isRedisMemoryConfigured()) {
          storeSessionEvent({
            sessionId,
            actorId: "quinn",
            role: "ASSISTANT",
            text: answer.slice(0, 4000),
          }).catch(() => {});
        }
        await ctx.reply(sanitizeMarkdown(answer.slice(0, 4000)), { parse_mode: "Markdown" });
      }
    } catch (error) {
      console.error("❌ Chat error:", error);
      await ctx.reply("Sorry, I hit an issue. Can you rephrase that?");
    }
  });

  bot.action(/approve:(.+)/, async (ctx) => {
    const id = ctx.match[1] as string;
    if (ctx.chat?.id) authorizedChatId = String(ctx.chat.id);
    await ctx.answerCbQuery("Approving...");
    await handleApproval(ctx as any, id, "APPROVED");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  });

  bot.action(/reject:(.+)/, async (ctx) => {
    const id = ctx.match[1] as string;
    if (ctx.chat?.id) authorizedChatId = String(ctx.chat.id);
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
    const chunks = splitIntoChunks(content, 3900);
    for (const chunk of chunks) {
      await ctx.reply(sanitizeMarkdown(chunk), { parse_mode: "Markdown" });
    }
  });

  bot.catch((err, ctx) => {
    console.error(`❌ Telegram bot error [${ctx?.updateType}]:`, err);
  });

  return bot;
}

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
    await ctx.reply(sanitizeMarkdown(`${label} *${approval.title}*${reason ? `\nReason: ${reason}` : ""}`), {
      parse_mode: "Markdown",
    });

    if (status === "APPROVED") {
      const result = await executeApprovedAction(id);
      await ctx.reply(sanitizeMarkdown(result.message), { parse_mode: "Markdown" });
    }
  } catch (error) {
    await ctx.reply(`❌ Error processing approval: ${(error as Error).message}`);
  }
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
