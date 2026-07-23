import { tool } from "@langchain/core/tools";
import { z } from "zod";

const RUNWAY_API = "https://api.runwayml.com/v1";

export const generateVideoTool = tool(
  async ({ prompt, aspectRatio, duration }) => {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      return "Runway API key not configured. Set RUNWAY_API_KEY in .env";
    }

    try {
      const createRes = await fetch(`${RUNWAY_API}/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gen3a",
          prompt,
          ...(aspectRatio && { aspectRatio }),
          ...(duration && { duration }),
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text().catch(() => "");
        return `Runway generation failed (${createRes.status}): ${errBody || createRes.statusText}`;
      }

      const { id } = (await createRes.json()) as { id: string };

      // Poll for completion (up to 5 min)
      const start = Date.now();
      const timeout = 300_000;
      const pollInterval = 10_000;

      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const statusRes = await fetch(`${RUNWAY_API}/generations/${id}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!statusRes.ok) {
          return `Video generation submitted (ID: ${id}) but status check failed. Check Runway dashboard for progress.`;
        }

        const data = (await statusRes.json()) as {
          status: string;
          output?: { video_url?: string };
          failure?: string;
        };

        if (data.status === "COMPLETED" && data.output?.video_url) {
          return `Video generated successfully: ${data.output.video_url}`;
        }

        if (data.status === "FAILED") {
          return `Video generation failed: ${data.failure || "Unknown error"}`;
        }
      }

      return `Video generation仍在处理中 (ID: ${id}). Generation takes 2-5 minutes. Check Runway dashboard for progress.`;
    } catch (error) {
      return `Video generation error: ${(error as Error).message}`;
    }
  },
  {
    name: "generate_video",
    description:
      "Generate a short AI video from a text description using Runway Gen-3 Alpha. Use for product demos, social media clips, explainers, and educational content. Returns the video URL once complete.",
    schema: z.object({
      prompt: z.string().describe("Detailed description of the video to generate"),
      aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Aspect ratio (default: 16:9)"),
      duration: z.number().optional().describe("Duration in seconds (default: 5, max: 10)"),
    }),
  },
);

export const generateImageTool = tool(
  async ({ prompt, aspectRatio }) => {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      return "Runway API key not configured. Set RUNWAY_API_KEY in .env";
    }

    try {
      const createRes = await fetch(`${RUNWAY_API}/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gen3a",
          prompt,
          type: "image",
          ...(aspectRatio && { aspectRatio }),
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text().catch(() => "");
        return `Runway image generation failed (${createRes.status}): ${errBody || createRes.statusText}`;
      }

      const { id } = (await createRes.json()) as { id: string };

      const start = Date.now();
      const timeout = 120_000;
      const pollInterval = 5_000;

      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const statusRes = await fetch(`${RUNWAY_API}/generations/${id}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!statusRes.ok) {
          return `Image generation submitted (ID: ${id}) but status check failed. Check Runway dashboard.`;
        }

        const data = (await statusRes.json()) as {
          status: string;
          output?: { image_url?: string };
          failure?: string;
        };

        if (data.status === "COMPLETED" && data.output?.image_url) {
          return `Image generated successfully: ${data.output.image_url}`;
        }

        if (data.status === "FAILED") {
          return `Image generation failed: ${data.failure || "Unknown error"}`;
        }
      }

      return `Image generation仍在处理中 (ID: ${id}). Check Runway dashboard.`;
    } catch (error) {
      return `Image generation error: ${(error as Error).message}`;
    }
  },
  {
    name: "generate_image",
    description:
      "Generate an AI image from a text description using Runway Gen-3. Use for social media visuals, carousel slides, thumbnails, and presentation assets.",
    schema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate"),
      aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional().describe("Aspect ratio (default: 16:9)"),
    }),
  },
);
