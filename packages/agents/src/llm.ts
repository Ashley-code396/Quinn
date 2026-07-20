import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

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

export type LLMProvider = "groq" | "gemini";

let currentProvider: LLMProvider = "groq";
let groqErrors = 0;
let geminiErrors = 0;
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

function getGroqModel(desired?: string): string {
  return desired ?? "llama-3.3-70b-versatile";
}

function getGeminiModel(desired?: string): string {
  if (desired && desired !== "llama-3.3-70b-versatile") return desired;
  return "gemini-2.0-flash";
}

export function createModel(config: ModelConfig = {}): Model {
  const temperature = config.temperature ?? 0.3;

  if (currentProvider === "groq") {
    return new ChatGroq({
      model: getGroqModel(config.model),
      temperature,
    });
  }

  return new ChatGoogleGenerativeAI({
    model: getGeminiModel(config.model),
    temperature,
    apiKey: process.env["GEMINI_API_KEY"],
  });
}

export async function withFallback<T>(
  fn: (model: Model) => Promise<T>,
  config?: ModelConfig,
): Promise<T> {
  const model = createModel(config);
  try {
    const result = await fn(model);
    if (currentProvider === "groq") groqErrors = 0;
    else geminiErrors = 0;
    return result;
  } catch (error) {
    if (isQuotaError(error)) {
      const msg = (error as any)?.message ?? (error as any)?.error?.message ?? "Unknown error";
      if (currentProvider === "groq") {
        groqErrors++;
        console.warn(`  ⚠️ Groq quota error (${groqErrors}/${SWAP_THRESHOLD}): ${msg.slice(0, 80)}`);
        if (groqErrors >= SWAP_THRESHOLD) {
          currentProvider = "gemini";
          groqErrors = 0;
          console.warn("  🔄 Switching LLM provider to Gemini");
        }
      } else {
        geminiErrors++;
        console.warn(`  ⚠️ Gemini quota error (${geminiErrors}/${SWAP_THRESHOLD}): ${msg.slice(0, 80)}`);
        if (geminiErrors >= SWAP_THRESHOLD) {
          currentProvider = "groq";
          geminiErrors = 0;
          console.warn("  🔄 Switching LLM provider to Groq");
        }
      }
      const retryModel = createModel(config);
      return await fn(retryModel);
    }
    throw error;
  }
}
