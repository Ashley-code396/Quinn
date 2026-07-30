import { tool } from "@langchain/core/tools";
import { z } from "zod";

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";

function getAccessToken(): string | null {
  return process.env.LINKEDIN_ACCESS_TOKEN ?? null;
}

function getPersonUrn(): string | null {
  return process.env.LINKEDIN_PERSON_URN ?? null;
}

export const sendLinkedInMessageTool = tool(
  async ({ recipientUrn, subject, body }) => {
    const token = getAccessToken();
    const senderUrn = getPersonUrn();
    if (!token) {
      return "LinkedIn DM not sent: LINKEDIN_ACCESS_TOKEN not configured.";
    }
    if (!senderUrn) {
      return "LinkedIn DM not sent: LINKEDIN_PERSON_URN not configured. Set the sender's person URN (urn:li:person:xxxxx).";
    }

    try {
      const res = await fetch(`${LINKEDIN_API_BASE}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": "202607",
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: senderUrn,
          recipients: [recipientUrn],
          subject,
          body,
          messageType: "MEMBER_TO_MEMBER",
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        if (res.status === 403) {
          return `LinkedIn DM failed (403): The token lacks messaging permissions. Ensure 'w_member_social' scope is enabled and the app has the "Messaging" product.`;
        }
        return `LinkedIn DM failed (${res.status}): ${err || res.statusText}`;
      }

      return `LinkedIn message sent successfully!\nTo: ${recipientUrn}\nSubject: ${subject}\n\nUpdate the contact's relationship stage and log this interaction.`;
    } catch (error) {
      return `LinkedIn DM error: ${(error as Error).message}`;
    }
  },
  {
    name: "send_linkedin_message",
    description:
      "Send a direct message to a LinkedIn connection via LinkedIn Messaging. Use for personalized outreach, follow-ups, and partnership conversations. Requires LINKEDIN_ACCESS_TOKEN with Messaging API access and LINKEDIN_PERSON_URN configured.",
    schema: z.object({
      recipientUrn: z
        .string()
        .describe(
          "Recipient's LinkedIn URN (e.g., urn:li:person:abc123). Look up via search_organizations or extract from a LinkedIn profile URL.",
        ),
      subject: z.string().describe("Message subject line"),
      body: z.string().describe("Message body text (personalized, professional)"),
    }),
  },
);

export const sendLinkedInConnectionRequestTool = tool(
  async ({ profileUrn, message }) => {
    const token = getAccessToken();
    if (!token) {
      return "LinkedIn connection not sent: LINKEDIN_ACCESS_TOKEN not configured.";
    }

    try {
      const res = await fetch(`${LINKEDIN_API_BASE}/connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": "202607",
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: profileUrn,
          message: message || undefined,
          trackingId: `dermaqea_outreach_${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return `LinkedIn connection request failed (${res.status}): ${err || res.statusText}`;
      }

      return `LinkedIn connection request sent to ${profileUrn}${message ? ` with message: "${message.slice(0, 100)}..."` : ""}`;
    } catch (error) {
      return `LinkedIn connection error: ${(error as Error).message}`;
    }
  },
  {
    name: "send_linkedin_connection_request",
    description:
      "Send a LinkedIn connection request with optional note. Use to expand network with industry professionals, potential partners, and clients before reaching out via DM.",
    schema: z.object({
      profileUrn: z
        .string()
        .describe(
          "LinkedIn profile URN to connect with (e.g., urn:li:person:abc123)",
        ),
      message: z
        .string()
        .optional()
        .describe("Optional personalized note (max 300 characters)"),
    }),
  },
);
