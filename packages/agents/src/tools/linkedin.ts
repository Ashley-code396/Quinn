import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getLinkedInPostAnalytics, getLinkedInPageAnalytics, isLinkedInConfigured } from "../linkedin/index.js";

export const getLinkedInAnalyticsTool = tool(
  async ({ days }) => {
    if (!isLinkedInConfigured()) {
      return "LinkedIn API not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN.";
    }
    const analytics = await getLinkedInPageAnalytics();
    const posts = await getLinkedInPostAnalytics(undefined, days ?? 7);
    return JSON.stringify({ pageAnalytics: analytics, recentPosts: posts }, null, 2);
  },
  {
    name: "get_linkedin_analytics",
    description: "Get LinkedIn page analytics and recent post performance data.",
    schema: z.object({
      days: z.number().optional().describe("Number of days of analytics to fetch (default 7)"),
    }),
  },
);


