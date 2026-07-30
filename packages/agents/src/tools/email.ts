import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getResendClient, getFromAddress } from "../executor/email-client.js";

export const sendEmailTool = tool(
  async ({ to, subject, body, cc, bcc }) => {
    const client = getResendClient();
    if (!client) {
      return "Email not sent: RESEND_API_KEY not configured. Set it in .env to enable email sending.";
    }

    try {
      const { data, error } = await client.emails.send({
        from: `Dermaqea <${getFromAddress()}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        text: body,
        ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
        ...(bcc ? { bcc: Array.isArray(bcc) ? bcc : [bcc] } : {}),
      });

      if (error) {
        return `Email failed to send: ${error.message}`;
      }

      return `Email sent successfully!\nTo: ${to}\nSubject: ${subject}\nID: ${data?.id}\n\nThis email has been sent. Update the organization's outreach status to CONTACTED.`;
    } catch (error) {
      return `Email sending error: ${(error as Error).message}`;
    }
  },
  {
    name: "send_email",
    description:
      "Send an email via Resend. Use for outreach, follow-ups, partnership proposals, and direct communication with potential clients and partners. Always get human approval before sending via create_approval with type EMAIL.",
    schema: z.object({
      to: z
        .union([z.string(), z.array(z.string())])
        .describe("Recipient email address(es)"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text (plain text)"),
      cc: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("CC recipient(s)"),
      bcc: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("BCC recipient(s)"),
    }),
  },
);

export const sendBulkEmailTool = tool(
  async ({ recipients, subject, body }) => {
    const client = getResendClient();
    if (!client) {
      return "Bulk email not sent: RESEND_API_KEY not configured.";
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };
    const batchSize = 10;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const promises = batch.map(async (recipient) => {
        try {
          const { error } = await client.emails.send({
            from: `Dermaqea <${getFromAddress()}>`,
            to: recipient.email,
            subject,
            text: body.replace(/\{name\}/g, recipient.name || "there"),
          });
          if (error) {
            results.failed++;
            results.errors.push(`${recipient.email}: ${error.message}`);
          } else {
            results.sent++;
          }
        } catch (e) {
          results.failed++;
          results.errors.push(`${recipient.email}: ${(e as Error).message}`);
        }
      });
      await Promise.all(promises);
    }

    return `Bulk email complete. Sent: ${results.sent}, Failed: ${results.failed}${results.errors.length > 0 ? `\nErrors:\n${results.errors.slice(0, 5).join("\n")}` : ""}`;
  },
  {
    name: "send_bulk_email",
    description:
      "Send the same email to multiple recipients. Use for newsletter sends, batch outreach, and campaign emails. Personalizes {name} placeholder in body. Requires RESEND_API_KEY.",
    schema: z.object({
      recipients: z
        .array(
          z.object({
            email: z.string(),
            name: z.string().optional(),
          }),
        )
        .describe("Array of recipients with email and optional name"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text with optional {name} placeholder"),
    }),
  },
);
