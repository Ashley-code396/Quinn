import { ChatGroq } from "@langchain/groq";
import { ChatGoogle } from "@langchain/google/node";
import { ChatOpenRouter } from "@langchain/openrouter";

type Invokable = {
  invoke(messages: any[]): Promise<any>;
};

type Model = Invokable & {
  bindTools(tools: any[]): Invokable;
  withStructuredOutput(schema: any): Invokable;
};

export type ModelConfig = {
  model?: string;
  temperature?: number;
};

export type LLMProvider = "groq" | "gemini" | "openrouter";

let currentProvider: LLMProvider = "groq";
let groqErrors = 0;
let geminiErrors = 0;
let openrouterErrors = 0;
const SWAP_THRESHOLD = 2;

export function getCurrentProvider(): LLMProvider {
  return currentProvider;
}

function isQuotaError(error: unknown): boolean {
  const err = error as any;
  const status = err?.status ?? err?.statusCode ?? 0;
  const msg = (err?.message ?? err?.error?.message ?? "").toLowerCase();
  return (
    status === 429 ||
    status === 413 ||
    msg.includes("429") ||
    msg.includes("413") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit_exceeded") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("insufficient_quota") ||
    msg.includes("too many requests") ||
    msg.includes("tokens per min") ||
    msg.includes("token limit") ||
    msg.includes("request too large") ||
    msg.includes("daily limit exceeded")
  );
}

function isToolCallError(error: unknown): boolean {
  const err = error as any;
  const code = err?.error?.code ?? err?.code ?? "";
  const msg = (err?.message ?? err?.error?.message ?? "").toLowerCase();
  return (
    code === "tool_use_failed" ||
    msg.includes("failed to call a function") ||
    msg.includes("tool_use_failed") ||
    msg.includes("invalid_function_call") ||
    (err?.status === 400 && (msg.includes("function") || msg.includes("tool")))
  );
}

function getGroqModel(desired?: string): string {
  return desired ?? "llama-3.3-70b-versatile";
}

function getGeminiModel(desired?: string): string {
  if (desired && desired !== "llama-3.3-70b-versatile") return desired;
  return "gemini-3.5-flash";
}

function getOpenRouterModel(desired?: string): string {
  if (desired && desired !== "llama-3.3-70b-versatile" && !desired.startsWith("gemini-")) return desired;
  return "nvidia/nemotron-3-super-120b-a12b:free";
}

export function createModel(config: ModelConfig = {}): Model {
  const temperature = config.temperature ?? 0.3;

  if (currentProvider === "groq") {
    return new ChatGroq({
      model: getGroqModel(config.model),
      temperature,
    });
  }

  if (currentProvider === "gemini") {
    return new ChatGoogle({
      model: getGeminiModel(config.model),
      temperature,
      apiKey: process.env["GEMINI_API_KEY"],
    });
  }

  return new ChatOpenRouter({
    model: getOpenRouterModel(config.model),
    temperature,
    apiKey: process.env["OPENROUTER_API_KEY"],
  });
}

function extractRetryAfter(error: unknown): number {
  const err = error as any;
  const msg = err?.message ?? err?.error?.message ?? "";
  const match = msg.match(/try again in ([\d.]+)s/);
  if (match?.[1]) return parseFloat(match[1]) * 1000 + 500;
  const retryHeader = err?.headers?.get?.("retry-after") ?? err?.headers?.["retry-after"];
  if (retryHeader) return parseInt(retryHeader) * 1000;
  return 2500;
}

function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function isOpenRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

export async function withFallback<T>(
  fn: (model: Model) => Promise<T>,
  config?: ModelConfig,
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const model = createModel(config);
      const result = await fn(model);
      groqErrors = 0;
      geminiErrors = 0;
      openrouterErrors = 0;
      return result;
    } catch (error) {
      const isMalformed = !isQuotaError(error) && !isToolCallError(error) && (
        (error instanceof TypeError && (error.message ?? "").includes("Cannot read properties of undefined"))
      );

      if (!isQuotaError(error) && !isMalformed && !isToolCallError(error)) throw error;

      const msg = (error as any)?.message ?? (error as any)?.error?.message ?? "Unknown error";

      if (isMalformed || isToolCallError(error)) {
        if (currentProvider === "groq") {
          console.warn("  ⚠️ Groq tool call failed — switching to Gemini");
          currentProvider = isGeminiConfigured() ? "gemini" : "openrouter";
          groqErrors = 0;
          continue;
        }
        if (currentProvider === "gemini") {
          console.warn("  ⚠️ Gemini tool call failed — switching to OpenRouter");
          currentProvider = "openrouter";
          geminiErrors = 0;
          continue;
        }
        if (currentProvider === "openrouter") {
          console.warn("  ⚠️ OpenRouter tool call failed — switching to Groq");
          currentProvider = "groq";
          openrouterErrors = 0;
          continue;
        }
        throw error;
      }

      const retryAfter = extractRetryAfter(error);

      if (currentProvider === "groq") {
        groqErrors++;
        console.warn(`  ⚠️ Groq rate limited (${groqErrors}/${SWAP_THRESHOLD}) — retry in ${(retryAfter / 1000).toFixed(1)}s`);
        if (groqErrors >= SWAP_THRESHOLD && isGeminiConfigured()) {
          currentProvider = "gemini";
          groqErrors = 0;
          console.warn("  🔄 Switching to Gemini");
          continue;
        }
      } else if (currentProvider === "gemini") {
        geminiErrors++;
        console.warn(`  ⚠️ Gemini rate limited (${geminiErrors}/${SWAP_THRESHOLD}) — retry in ${(retryAfter / 1000).toFixed(1)}s`);
        if (geminiErrors >= SWAP_THRESHOLD && isOpenRouterConfigured()) {
          currentProvider = "openrouter";
          geminiErrors = 0;
          console.warn("  🔄 Switching to OpenRouter (free)");
          continue;
        }
      } else {
        openrouterErrors++;
        console.warn(`  ⚠️ OpenRouter rate limited (${openrouterErrors}/${SWAP_THRESHOLD}) — retry in ${(retryAfter / 1000).toFixed(1)}s`);
        if (openrouterErrors >= SWAP_THRESHOLD) {
          currentProvider = "groq";
          openrouterErrors = 0;
          console.warn("  🔄 Switching back to Groq");
          continue;
        }
      }

      console.warn(`  ⏳ Waiting ${(retryAfter / 1000).toFixed(1)}s before retry...`);
      await new Promise((r) => setTimeout(r, retryAfter));
    }
  }
  throw new Error("All providers exhausted — try again later.");
}
