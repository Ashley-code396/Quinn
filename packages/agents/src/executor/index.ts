/**
 * Post-Approval Executor
 *
 * When the CEO approves an action through Telegram or the API,
 * this module executes the approved action:
 * - Email outreach: marks as ready to send (placeholder)
 * - LinkedIn posts: stored for publishing (placeholder)
 * - Grant applications: marks for submission
 * - Partnership proposals: marks for sending
 *
 * No external action occurs without prior human approval.
 */

import { prisma } from "@quinn/database";

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
  await prisma.agentLog.create({
    data: {
      agentName: "NOVA" as any,
      action: "linkedin_post_approved",
      input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
      output: JSON.stringify({ status: "queued_for_publishing", note: "LinkedIn API integration pending" }),
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
    message: `LinkedIn post "${approval.title}" approved and queued for publishing. Note: LinkedIn auto-publish requires API integration.`,
  };
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
