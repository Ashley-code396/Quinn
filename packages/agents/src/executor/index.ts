import { prisma } from "@quinn/database";
import { createLinkedInPost, isLinkedInConfigured } from "../linkedin/index.js";
import { getResendClient, getFromAddress } from "./email-client.js";
import { registerForEventTool } from "../tools/forms.js";

export type ExecutionResult = {
  success: boolean;
  message: string;
};

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
      output: JSON.stringify({ status: "executing" }),
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
    case "CONFERENCE_REGISTRATION":
      return handleConferenceRegistration(approval);
    case "INVESTOR_OUTREACH":
      return handleInvestorOutreach(approval);
    default:
      return markReady(approval);
  }
}

async function handleLinkedInPost(approval: any): Promise<ExecutionResult> {
  const postContent = typeof approval.content === "string"
    ? approval.content
    : approval.content?.body ?? approval.content?.text ?? JSON.stringify(approval.content);

  if (!isLinkedInConfigured()) {
    await logLinkedInQueued(approval);
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
    await logLinkedInPublished(approval, result);

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

    const postUrl = `https://www.linkedin.com/feed/update/${result.urn}`;
    return {
      success: true,
      message: `✅ I posted to LinkedIn today:\n\n"${approval.title}"\n${postUrl}\n\nIt's live on the Dermaqea company page. I'll check engagement in the next analytics sweep.`,
    };
  } catch (error: any) {
    await logLinkedInFailed(approval, error);
    return {
      success: false,
      message: `❌ I tried to post "${approval.title}" but it failed: ${error.message}. I'll flag it for review.`,
    };
  }
}

async function handleEmail(approval: any): Promise<ExecutionResult> {
  const content = typeof approval.content === "string"
    ? JSON.parse(approval.content)
    : approval.content;

  const to = content.to || content.recipient || content.email;
  const subject = content.subject || approval.title;
  const body = content.body || content.message || content.text || JSON.stringify(content);

  if (!to) {
    return { success: false, message: `Email "${approval.title}" has no recipient. Include "to", "recipient", or "email" in the content.` };
  }

  const resendClient = getResendClient();
  if (!resendClient) {
    return markReady(approval, "Email queued for manual send: RESEND_API_KEY not configured.");
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: `Dermaqea <${getFromAddress()}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: body,
    });

    if (error) {
      return { success: false, message: `Email failed: ${error.message}` };
    }

    await prisma.agentLog.create({
      data: {
        agentName: (approval.agentName || "QUINN") as any,
        action: "email_sent",
        input: JSON.stringify({ approvalId: approval.id, to, subject }),
        output: JSON.stringify({ status: "sent", resendId: data?.id }),
      },
    });

    const recipient = Array.isArray(to) ? to.join(", ") : to;
    return {
      success: true,
      message: `✅ I sent an email just now:\n\nTo: ${recipient}\nSubject: "${subject}"\n\nIt's on its way to their inbox. I'll follow up if I don't hear back in a few days.`,
    };
  } catch (error: any) {
    return { success: false, message: `❌ I couldn't send the email to "${to}": ${error.message}. I'll retry on the next cycle.` };
  }
}

async function handleGrantApplication(approval: any): Promise<ExecutionResult> {
  const content = typeof approval.content === "string"
    ? approval.content
    : JSON.stringify(approval.content);

  return markReady(approval, `Grant application drafted and ready for submission.\n\nContent preview:\n${content.slice(0, 500)}...`);
}

async function handlePartnershipProposal(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Partnership proposal approved. Generate a PDF with generate_pdf and send via send_email for delivery.");
}

async function handlePitchDeck(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Pitch deck approved. Generate slides with generate_slides for investor presentation.");
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

async function handleConferenceRegistration(approval: any): Promise<ExecutionResult> {
  const content = typeof approval.content === "string"
    ? (() => { try { return JSON.parse(approval.content); } catch { return { text: approval.content }; } })()
    : approval.content;

  const eventName = content.eventName || content.event || approval.title;
  const url = content.url || content.registrationUrl || content.link || content.eventUrl;

  if (!url) {
    return markReady(approval, `No registration URL found for "${eventName}". Provide a URL to auto-register.`);
  }

  // Attempt auto-registration using Playwright
  try {
    const result = await registerForEventTool.invoke({
      eventName,
      eventUrl: url,
      attendeeName: content.attendeeName || content.name,
      attendeeEmail: content.attendeeEmail || content.email,
      company: content.company || "Dermaqea",
      jobTitle: content.jobTitle || content.title,
      additionalFields: content.additionalFields,
    });

    const isSuccess = result.startsWith("Successfully registered");

    await prisma.agentLog.create({
      data: {
        agentName: (approval.agentName || "HELIX") as any,
        action: isSuccess ? "event_registered" : "event_registration_attempted",
        input: JSON.stringify({ approvalId: approval.id, eventName, url }),
        output: JSON.stringify({ result: result.slice(0, 1000) }),
        success: isSuccess,
      },
    });

    if (isSuccess) {
      return {
        success: true,
        message: `✅ I registered Dermaqea for "${eventName}"!\n\nI filled in the form and the confirmation page was detected. You should receive a confirmation email shortly. Check your inbox for details.`,
      };
    }

    return {
      success: true,
      message: `⚠️ I attempted to register for "${eventName}" but couldn't confirm success. Check the event page to verify:\n${url}`,
    };
  } catch (error: any) {
    await prisma.agentLog.create({
      data: {
        agentName: (approval.agentName || "HELIX") as any,
        action: "event_registration_failed",
        input: JSON.stringify({ approvalId: approval.id, eventName, url }),
        output: JSON.stringify({ error: error.message }),
        success: false,
      },
    });

    return markReady(approval, `Auto-registration failed for "${eventName}": ${error.message}\nRegister manually at: ${url}`);
  }
}

async function handleInvestorOutreach(approval: any): Promise<ExecutionResult> {
  return markReady(approval, "Investor outreach approved. Generate pitch deck via generate_slides and send via send_email with personalized introduction.");
}

async function markReady(approval: any, note?: string): Promise<ExecutionResult> {
  return {
    success: true,
    message: `${approval.title} — ready for execution.${note ? ` ${note}` : ""}`,
  };
}

async function logLinkedInQueued(approval: any) {
  await prisma.agentLog.create({
    data: {
      agentName: "NOVA" as any,
      action: "linkedin_post_queued",
      input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
      output: JSON.stringify({ status: "queued", note: "LinkedIn API not configured" }),
    },
  });
}

async function logLinkedInPublished(approval: any, result: any) {
  await prisma.agentLog.create({
    data: {
      agentName: "NOVA" as any,
      action: "linkedin_post_published",
      input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
      output: JSON.stringify({ status: "published", linkedinId: result.id, urn: result.urn }),
    },
  });
}

async function logLinkedInFailed(approval: any, error: any) {
  await prisma.agentLog.create({
    data: {
      agentName: "NOVA" as any,
      action: "linkedin_post_failed",
      input: JSON.stringify({ approvalId: approval.id, title: approval.title }),
      output: JSON.stringify({ error: error.message }),
      success: false,
    },
  });
}
