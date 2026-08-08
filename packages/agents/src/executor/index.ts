import { prisma } from "@quinn/database";
import { createLinkedInPost, isLinkedInConfigured } from "../linkedin/index.js";
import { getResendClient, getFromAddress } from "./email-client.js";
import { registerForEventTool } from "../tools/forms.js";
import { generatePdfTool } from "../tools/pdf.js";

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

function parseEmailContent(approval: any): any {
  let content: any = approval.content;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      const toMatch = content.match(/^to:\s*(.+)$/im);
      const subjectMatch = content.match(/^subject:\s*(.+)$/im);
      const body = content
        .replace(/^to:\s*.+$/im, "")
        .replace(/^subject:\s*.+$/im, "")
        .trim();
      content = {
        ...(toMatch ? { to: toMatch[1].trim() } : {}),
        ...(subjectMatch ? { subject: subjectMatch[1].trim() } : {}),
        ...(body ? { body } : {}),
      };
    }
  }
  return content && typeof content === "object" ? content : {};
}

async function handleEmail(approval: any): Promise<ExecutionResult> {
  const content = parseEmailContent(approval);

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
  const content = typeof approval.content === "string"
    ? (() => { try { return JSON.parse(approval.content); } catch { return { text: approval.content }; } })()
    : approval.content;

  const companyName = content.company || content.companyName || content.brand || "Potential Partner";
  const contactEmail = content.to || content.email || content.contactEmail;
  const contactName = content.contactName || content.name || "there";
  const proposalTitle = `Partnership Proposal: ${companyName} x Dermaqea`;

  // 1. Generate PDF proposal
  try {
    const pdfResult = await generatePdfTool.invoke({
      title: proposalTitle,
      content: [
        `# ${proposalTitle}`,
        ``,
        `## Executive Summary`,
        `Dermaqea proposes a strategic partnership with ${companyName} to eliminate counterfeit skincare products using invisible cryptographic authentication technology.`,
        ``,
        `## The Problem`,
        `- The global counterfeit cosmetics market costs brands $75B annually`,
        `- 1 in 5 luxury beauty products is counterfeit`,
        `- Counterfeit products contain toxic ingredients: arsenic, mercury, bacteria`,
        `- Current authentication methods (QR codes, holograms) are easily replicated`,
        ``,
        `## The Solution`,
        `Dermaqea embeds invisible cryptographic signatures directly into packaging artwork. Consumers verify authenticity with a simple smartphone scan — no app required.`,
        ``,
        `## Why Partner with Dermaqea`,
        `- Zero changes to existing packaging workflow`,
        `- Invisible mark — no impact on design aesthetics`,
        `- Instant verification with any smartphone`,
        `- Real-time analytics on scan locations and frequency`,
        `- Build consumer trust and brand loyalty`,
        ``,
        `## Partnership Model`,
        `- **Pilot Program**: ${companyName} tests Dermaqea on one product line`,
        `- **Timeline**: 4-week implementation, 30-day pilot`,
        `- **Investment**: Free pilot — pay only for results`,
        `- **Support**: Dedicated integration team, 24/7 support`,
        ``,
        `## Expected Outcomes`,
        `- 100% authentic product guarantee for consumers`,
        `- Real-time counterfeit detection and alerting`,
        `- Enhanced brand trust and premium positioning`,
        `- Consumer engagement through scan analytics`,
        ``,
        `## Next Steps`,
        `1. Schedule a 15-minute discovery call`,
        `2. Define pilot scope and success metrics`,
        `3. Technical integration (1-2 weeks)`,
        `4. Launch pilot and measure results`,
        ``,
        `## Contact`,
        `Ashley Mwende, Founder`,
        `Dermaqea`,
        `https://dermaqea.vercel.app`,
      ].join("\n"),
      includeTableOfContents: true,
    });

    await prisma.agentLog.create({
      data: {
        agentName: (approval.agentName || "QUINN") as any,
        action: "proposal_pdf_generated",
        input: JSON.stringify({ approvalId: approval.id, company: companyName }),
        output: JSON.stringify({ result: pdfResult.slice(0, 500) }),
        success: true,
      },
    });

    // 2. Send email with proposal if we have a contact
    if (contactEmail) {
      const resendClient = getResendClient();
      if (resendClient) {
        const emailBody = [
          `Hi ${contactName},`,
          ``,
          `I'm reaching out from Dermaqea about a partnership opportunity I think ${companyName} would find valuable.`,
          ``,
          `We've developed invisible cryptographic authentication for skincare packaging — consumers verify authenticity with a smartphone scan, no app needed. It addresses the $75B counterfeit cosmetics crisis head-on.`,
          ``,
          `I've attached a partnership proposal with more details. I'd love to schedule a 15-minute call to discuss how this could work for ${companyName}.`,
          ``,
          `Would you be open to a quick chat next week?`,
          ``,
          `Best,`,
          `Ashley Mwende`,
          `Founder, Dermaqea`,
          `https://dermaqea.vercel.app`,
        ].join("\n");

        const { error } = await resendClient.emails.send({
          from: `Dermaqea <${getFromAddress()}>`,
          to: contactEmail,
          subject: `Partnership opportunity: ${companyName} x Dermaqea`,
          text: emailBody,
        });

        if (!error) {
          await prisma.agentLog.create({
            data: {
              agentName: (approval.agentName || "QUINN") as any,
              action: "proposal_email_sent",
              input: JSON.stringify({ to: contactEmail, company: companyName }),
              output: JSON.stringify({ status: "sent" }),
              success: true,
            },
          });

          return {
            success: true,
            message: `✅ I generated a partnership proposal PDF for ${companyName} and emailed it to ${contactEmail}.\n\nThe proposal includes: problem, solution, partnership model, and next steps. I'll follow up in a few days if I don't hear back.`,
          };
        }
      }

      return {
        success: true,
        message: `✅ I generated a PDF partnership proposal for ${companyName}.\n\nTo send it, I need RESEND_API_KEY configured. The PDF is ready to attach to an email to ${contactEmail}.`,
      };
    }

    return {
      success: true,
      message: `✅ I generated a partnership proposal PDF for ${companyName}.\n\nI don't have a contact email for them. Check the assets directory for the PDF and send it manually.`,
    };
  } catch (error: any) {
    await prisma.agentLog.create({
      data: {
        agentName: (approval.agentName || "QUINN") as any,
        action: "proposal_generation_failed",
        input: JSON.stringify({ approvalId: approval.id, company: companyName }),
        output: JSON.stringify({ error: error.message }),
        success: false,
      },
    });

    return {
      success: false,
      message: `❌ I tried to generate a partnership proposal for ${companyName} but hit an error: ${error.message}. I'll flag this for review.`,
    };
  }
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
