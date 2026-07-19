import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { prisma } from "@quinn/database";
import type { QuinnGraph } from "../graph.js";
import { chatWithQuinn } from "../workflows/index.js";
import { isRedisMemoryConfigured, storeSessionEvent } from "../memory/index.js";

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

export function createTelegramBot(graph: QuinnGraph): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("⚠️  TELEGRAM_BOT_TOKEN not set. Telegram bot disabled.");
    return null;
  }

  const bot = new Telegraf(token);

  bot.use((ctx, next) => {
    if (!isAllowed(ctx)) {
      return ctx.reply("⛔ Unauthorized.");
    }
    return next();
  });

  bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const chatId = ctx.chat?.id;
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
      const result = await chatWithQuinn(graph, text, threadId);
      const lastMessage = result.messages[result.messages.length - 1];
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
    await ctx.reply(sanitizeMarkdown(`📄 *${approval.title}*\n\n${content.slice(0, 3500)}`), {
      parse_mode: "Markdown",
    });
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
  } catch (error) {
    await ctx.reply(`❌ Error processing approval: ${(error as Error).message}`);
  }
}
