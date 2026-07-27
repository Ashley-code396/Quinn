import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createLinkedInPost, isLinkedInConfigured } from "../linkedin/index.js";

export const createLinkedInPostTool = tool(
  async ({ text, imageUrl, articleUrl, articleTitle, articleDescription }) => {
    if (!isLinkedInConfigured()) {
      return "LinkedIn API not configured. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN to publish.";
    }

    try {
      const result = await createLinkedInPost(text, {
        imageUrl,
        articleUrl,
        articleTitle,
        articleDescription,
      });
      return `LinkedIn post published successfully!\nPost ID: ${result.id}\nURN: ${result.urn}\nURL: https://www.linkedin.com/feed/update/${result.urn}`;
    } catch (error: any) {
      return `Failed to publish LinkedIn post: ${error.message}`;
    }
  },
  {
    name: "create_linkedin_post",
    description:
      "Publish a post directly to LinkedIn. Use this after generating content and media (images/videos). Supports optional image URL and article link.",
    schema: z.object({
      text: z.string().describe("The full LinkedIn post text (max 3000 characters)"),
      imageUrl: z.string().optional().describe("URL of an image to attach to the post"),
      articleUrl: z.string().optional().describe("URL of an article to link in the post"),
      articleTitle: z.string().optional().describe("Title of the linked article"),
      articleDescription: z.string().optional().describe("Description of the linked article"),
    }),
  },
);
