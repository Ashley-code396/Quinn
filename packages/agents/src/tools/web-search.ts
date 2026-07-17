/**
 * Web Search Tool (Tavily)
 *
 * Wraps Tavily Search API as a LangChain tool that agents
 * like Sage, Atlas, Nova, and Beacon can use for research.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

export const searchWebTool = tool(
  async ({ query, maxResults }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "Tavily API key not configured. Set TAVILY_API_KEY in .env";

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults ?? 5,
          include_answer: true,
        }),
      });

      if (!response.ok) {
        return `Tavily search failed: ${response.status} ${response.statusText}`;
      }

      const data = (await response.json()) as TavilyResponse;

      if (!data.results || data.results.length === 0) {
        return "No search results found.";
      }

      let output = "";
      if (data.answer) {
        output += `Answer: ${data.answer}\n\n`;
      }

      output += "Results:\n";
      for (const r of data.results) {
        output += `\n- ${r.title}\n  URL: ${r.url}\n  ${r.content.slice(0, 500)}`;
      }

      return output;
    } catch (error) {
      return `Search error: ${(error as Error).message}`;
    }
  },
  {
    name: "search_web",
    description:
      "Search the web for current information. Use for researching companies, grants, competitors, industry trends, news, and opportunities.",
    schema: z.object({
      query: z.string().describe("Search query"),
      maxResults: z.number().optional().describe("Max results to return (default 5, max 10)"),
    }),
  },
);

export const extractWebContentTool = tool(
  async ({ url }) => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Quinn-CMO/1.0 (research bot)" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return `Failed to fetch ${url}: ${response.status}`;
      }

      const html = await response.text();

      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);

      return text || "No readable content extracted.";
    } catch (error) {
      return `Extraction error: ${(error as Error).message}`;
    }
  },
  {
    name: "extract_web_content",
    description:
      "Extract readable text content from a URL. Use after search_web to get details from a specific page.",
    schema: z.object({
      url: z.string().describe("Full URL to extract content from"),
    }),
  },
);
