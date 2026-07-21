/**
 * Post-Approval Executor
 *
 * When the CEO approves an action through Telegram or the API,
 * this module executes the approved action.
 *
 * No external action occurs without prior human approval.
 */

import { prisma } from "@quinn/database";
import { createLinkedInPost, isLinkedInConfigured } from "../linkedin/index.js";

export type ExecutionResult = {
  success: boolean;
  message: string;
};

/**
 * Execute an approved action.
 * This is called after the CEO approves via Telegram (/approve) or the API.
 */
export async function executeApprovedAction(approvalId: string): Promise<ExecutionResult> {
  const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
  if (!approval) return { success: false, message: "Approval not found" };
  if (approval.status !== "APPROVED") return { success: false, message: "Approval not in APPROVED status" };

  const agentName = approval.agentName;

  await prisma.agentLog.create({
    data: {
      agentName: agentName as any,
      action: `execute_approved:${approval.type}`,
      input: JSON.stringify({ approvalId, title: approval.title }),
      output: JSON.stringify({ status: "ready_for_execution" }),
    },
  });

  switch (approval.type) {
    case "LINKEDIN_POST":
      return handleLinkedInPost(approval);
    case "SOCIAL_MEDIA":
      return handleLinkedInPost(approval);
    case "EMAIL":
      return handleEmail(approval);
    case "GRANT_APPLICATION":
      return handleGrantApplication(approval);
    case "PARTNERSHIP_PROPOSAL":
      return handlePartnershipProposal(approval);
    case "PITCH_DECK":
      return handlePitchDeck(approval);
    case "BLOG_POST":
    case "NEWSLETTER":
      return handleContentPublish(approval);
    default:
      return markReady(approval);
  }
}

async function handleLinkedInPost(approval: any): Promise<ExecutionResult> {
  const postContent = typeof approval.content === "string"
    ? approval.content
    : approval.content?.body ?? approval.content?.text ?? JSON.stringify(approval.content);

  if (!isLinkedInConfigured()) {
    await prisma.agentLog.create({
      data: {
        agentName: "NOVA" as any,
        action: "linkedin_post_queued",
        input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
        output: JSON.stringify({ status: "queued", note: "LinkedIn API not configured, post queued for manual publish" }),
      },
    });

    if (approval.contentItemId) {
      await prisma.contentItem.update({
        where: { id: approval.contentItemId },
        data: { status: "APPROVED" },
      });
    }

    return {
      success: true,
      message: `"${approval.title}" approved. To enable auto-publishing, set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN.`,
    };
  }

  try {
    const result = await createLinkedInPost(postContent);

    await prisma.agentLog.create({
      data: {
        agentName: "NOVA" as any,
        action: "linkedin_post_published",
        input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
        output: JSON.stringify({ status: "published", linkedinId: result.id, urn: result.urn }),
      },
    });

    if (approval.contentItemId) {
      await prisma.contentItem.update({
        where: { id: approval.contentItemId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedUrl: `https://www.linkedin.com/feed/update/${result.urn}`,
        },
      });
    }

    return {
      success: true,
      message: `✅ LinkedIn post "${approval.title}" published successfully!`,
    };
  } catch (error: any) {
    await prisma.agentLog.create({
      data: {
        agentName: "NOVA" as any,
        action: "linkedin_post_failed",
        input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
        output: JSON.stringify({ error: error.message }),
        success: false,
      },
    });

    return {
      success: false,
      message: `Failed to publish "${approval.title}": ${error.message}`,
    };
  }
}

async function handleEmail(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Email sending requires SMTP/API integration.");
}

async function handleGrantApplication(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Grant application marked for submission.");
}

async function handlePartnershipProposal(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Partnership proposal marked for sending.");
}

async function handlePitchDeck(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Pitch deck approved for investor meeting.");
}

async function handleContentPublish(approval: any): Promise<ExecutionResult> {
  if (approval.contentItemId) {
    await prisma.contentItem.update({
      where: { id: approval.contentItemId },
      data: { status: "APPROVED" },
    });
  }
  return markReady(approval, "Content approved for publishing.");
}

async function markReady(approval: any, note?: string): Promise<ExecutionResult> {
  return {
    success: true,
    message: `${approval.title} — ready for execution.${note ? ` ${note}` : ""}`,
  };
}
