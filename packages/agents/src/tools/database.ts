/**
 * Database Tools
 *
 * Tools that agents use to query and update the Prisma database.
 * These are wrapped as LangChain tools for use in agent toolkits.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma, OpportunityType, OpportunityStatus, AgentName, OutreachStatus } from "@quinn/database";

/**
 * Search organizations in the database.
 */
export const searchOrganizationsTool = tool(
  async ({ query, industry, status, limit }) => {
    const orgs = await prisma.organization.findMany({
      where: {
        AND: [
          query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { industry: { contains: query, mode: "insensitive" } },
                  { researchNotes: { contains: query, mode: "insensitive" } },
                ],
              }
            : {},
          industry ? { industry: { contains: industry, mode: "insensitive" } } : {},
          status ? { outreachStatus: outreachStatusMap[status.toLowerCase()] ?? (status as OutreachStatus) } : {},
        ],
      },
      orderBy: { priorityScore: "desc" },
      take: toNumber(limit) ?? 10,
    });
    return JSON.stringify(orgs, null, 2);
  },
  {
    name: "search_organizations",
    description:
      "Search the database for organizations by name, industry, or outreach status. Returns structured organization profiles.",
    schema: z.object({
      query: z.string().optional().describe("Search query for name, industry, or notes"),
      industry: z.string().optional().describe("Filter by industry"),
      status: z.string().optional().describe("Filter by outreach status"),
      limit: z.union([z.number(), z.string()]).optional().describe("Max results to return (default 10)"),
    }),
  },
);

/**
 * Create or update an organization profile.
 */
export const upsertOrganizationTool = tool(
  async (params) => {
    const { id, priorityScore, ...rest } = params;
    const data = {
      ...rest,
      ...(priorityScore != null && { priorityScore: toNumber(priorityScore) }),
    };
    let org;
    if (id) {
      org = await prisma.organization.update({
        where: { id },
        data: { ...data, lastResearchedAt: new Date() },
      });
    } else {
      // Check for duplicates by name
      const existing = await prisma.organization.findFirst({
        where: { name: { equals: data.name, mode: "insensitive" } },
      });
      if (existing) {
        org = await prisma.organization.update({
          where: { id: existing.id },
          data: { ...data, lastResearchedAt: new Date() },
        });
      } else {
        org = await prisma.organization.create({
          data: { ...data, lastResearchedAt: new Date() },
        });
      }
    }
    return JSON.stringify(org, null, 2);
  },
  {
    name: "upsert_organization",
    description:
      "Create a new organization profile or update an existing one. Automatically checks for duplicates by name.",
    schema: z.object({
      id: z.string().optional().describe("Organization ID for updates"),
      name: z.string().describe("Company name"),
      website: z.string().optional(),
      country: z.string().optional(),
      industry: z.string().optional(),
      products: z.array(z.string()).optional(),
      companySize: z.string().optional(),
      linkedinUrl: z.string().optional(),
      recentNews: z.string().optional(),
      dermaqeaRelevance: z.string().optional(),
      partnershipPotential: z.string().optional(),
      priorityScore: z.union([z.number(), z.string()]).optional(),
      researchNotes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
);

/**
 * Get pending approvals.
 */
export const getPendingApprovalsTool = tool(
  async ({ limit }) => {
    const approvals = await prisma.approval.findMany({
      where: { status: "PENDING" },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: toNumber(limit) ?? 20,
    });
    return JSON.stringify(approvals, null, 2);
  },
  {
    name: "get_pending_approvals",
    description: "Get all pending approval requests that need human review.",
    schema: z.object({
      limit: z.union([z.number(), z.string()]).optional().describe("Max results (default 20)"),
    }),
  },
);

/**
 * Create an approval request.
 */
export const createApprovalTool = tool(
  async (params) => {
    const data = {
      ...params,
      type: asEnum(params.type, APPROVAL_TYPES, "OTHER"),
      priority: asEnum(params.priority, PRIORITIES, "MEDIUM"),
      effort: asEnum(params.effort, EFFORTS, "MEDIUM"),
      agentName: asEnum(params.agentName?.toUpperCase(), AGENT_NAMES, "QUINN"),
      confidence: toNumber(params.confidence as never),
    };
    const approval = await prisma.approval.create({
      data: data as never,
    });
    return JSON.stringify(approval, null, 2);
  },
  {
    name: "create_approval",
    description:
      "Submit something for human approval. Use this for any external action (sending emails, publishing content, submitting proposals, etc.)",
    schema: z.object({
      type: z.string().describe("Approval type: EMAIL, LINKEDIN_POST, PARTNERSHIP_PROPOSAL, etc."),
      title: z.string().describe("Short title for the approval"),
      description: z.string().describe("Detailed description"),
      content: z.any().describe("The actual draft/proposal content"),
      agentName: z.string().describe("Which agent is requesting this"),
      priority: z.string().describe("CRITICAL, HIGH, MEDIUM, or LOW"),
      reasoning: z.string().describe("Why Quinn recommends this"),
      impact: z.string().describe("Expected business impact"),
      effort: z.string().describe("LOW, MEDIUM, or HIGH"),
      confidence: z.union([z.number(), z.string()]).describe("Confidence score 0-100"),
      metrics: z.array(z.string()).describe("Success measurement criteria"),
    }),
  },
);

/**
 * Get quarterly goals and key results.
 */
export const getQuarterlyGoalsTool = tool(
  async ({ quarter }) => {
    const goals = await prisma.quarterlyGoal.findMany({
      where: quarter ? { quarter } : undefined,
      include: { keyResults: true, initiatives: true },
      orderBy: { createdAt: "desc" },
    });
    return JSON.stringify(goals, null, 2);
  },
  {
    name: "get_quarterly_goals",
    description: "Get quarterly goals, key results, and initiatives.",
    schema: z.object({
      quarter: z.string().optional().describe("Quarter string like '2026-Q3'. Omit for all."),
    }),
  },
);

/**
 * Get content items.
 */
export const getContentItemsTool = tool(
  async ({ type, status, limit }) => {
    const items = await prisma.contentItem.findMany({
      where: {
        ...(type && { type: type as never }),
        ...(status && { status: status as never }),
      },
      orderBy: { createdAt: "desc" },
      take: toNumber(limit) ?? 20,
    });
    return JSON.stringify(items, null, 2);
  },
  {
    name: "get_content_items",
    description: "Get content items from the database with optional filtering.",
    schema: z.object({
      type: z.string().optional().describe("Content type filter"),
      status: z.string().optional().describe("Content status filter"),
      limit: z.union([z.number(), z.string()]).optional().describe("Max results"),
    }),
  },
);

/**
 * Create a content item.
 */
export const createContentItemTool = tool(
  async (params) => {
    const item = await prisma.contentItem.create({
      data: params as never,
    });
    return JSON.stringify(item, null, 2);
  },
  {
    name: "create_content_item",
    description: "Create a new content item (LinkedIn post, blog article, etc.)",
    schema: z.object({
      type: z.string().describe("Content type: LINKEDIN_POST, BLOG_ARTICLE, etc."),
      title: z.string().describe("Content title"),
      body: z.string().describe("Full content body"),
      summary: z.string().optional().describe("Brief summary"),
      tags: z.array(z.string()).optional(),
      targetDate: z.string().optional().describe("Target publish date (ISO string)"),
    }),
  },
);

/**
 * Get relationships that need follow-up.
 */
export const getFollowUpsDueTool = tool(
  async ({ daysAhead }) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (toNumber(daysAhead) ?? 7));
    const relationships = await prisma.relationship.findMany({
      where: {
        nextFollowUp: { lte: cutoff },
        stage: { notIn: ["CHURNED"] },
      },
      include: {
        organization: { select: { name: true, id: true } },
        contact: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { nextFollowUp: "asc" },
    });
    return JSON.stringify(relationships, null, 2);
  },
  {
    name: "get_followups_due",
    description: "Get relationships with follow-ups due within the specified number of days.",
    schema: z.object({
      daysAhead: z.union([z.number(), z.string()]).optional().describe("Days ahead to check (default 7)"),
    }),
  },
);

/**
 * Get opportunities.
 */
const outreachStatusMap: Record<string, OutreachStatus> = {
  "not contacted": OutreachStatus.NOT_CONTACTED,
  not_contacted: OutreachStatus.NOT_CONTACTED,
  researching: OutreachStatus.RESEARCHING,
  "draft ready": OutreachStatus.DRAFT_READY,
  draft_ready: OutreachStatus.DRAFT_READY,
  "awaiting approval": OutreachStatus.AWAITING_APPROVAL,
  awaiting_approval: OutreachStatus.AWAITING_APPROVAL,
  contacted: OutreachStatus.CONTACTED,
  responded: OutreachStatus.RESPONDED,
  "in conversation": OutreachStatus.IN_CONVERSATION,
  in_conversation: OutreachStatus.IN_CONVERSATION,
  "meeting scheduled": OutreachStatus.MEETING_SCHEDULED,
  meeting_scheduled: OutreachStatus.MEETING_SCHEDULED,
  "proposal sent": OutreachStatus.PROPOSAL_SENT,
  proposal_sent: OutreachStatus.PROPOSAL_SENT,
  negotiating: OutreachStatus.NEGOTIATING,
  partner: OutreachStatus.PARTNER,
  declined: OutreachStatus.DECLINED,
  dormant: OutreachStatus.DORMANT,
};

const opportunityTypeMap: Record<string, OpportunityType> = {
  partnership: OpportunityType.STRATEGIC_PARTNER,
  "strategic partner": OpportunityType.STRATEGIC_PARTNER,
  enterprise: OpportunityType.ENTERPRISE_PROSPECT,
  "enterprise prospect": OpportunityType.ENTERPRISE_PROSPECT,
  pilot: OpportunityType.PILOT_CUSTOMER,
  "pilot customer": OpportunityType.PILOT_CUSTOMER,
  investor: OpportunityType.INVESTOR,
  accelerator: OpportunityType.ACCELERATOR,
  grant: OpportunityType.GRANT,
  conference: OpportunityType.CONFERENCE,
  competition: OpportunityType.COMPETITION,
  media: OpportunityType.MEDIA_FEATURE,
  "media feature": OpportunityType.MEDIA_FEATURE,
  speaking: OpportunityType.SPEAKING_ENGAGEMENT,
  "speaking engagement": OpportunityType.SPEAKING_ENGAGEMENT,
};

const opportunityStatusMap: Record<string, OpportunityStatus> = {
  identified: OpportunityStatus.IDENTIFIED,
  researching: OpportunityStatus.RESEARCHING,
  qualified: OpportunityStatus.QUALIFIED,
  pursuing: OpportunityStatus.PURSUING,
  applied: OpportunityStatus.APPLIED,
  "in progress": OpportunityStatus.IN_PROGRESS,
  in_progress: OpportunityStatus.IN_PROGRESS,
  won: OpportunityStatus.WON,
  lost: OpportunityStatus.LOST,
  deferred: OpportunityStatus.DEFERRED,
};

export const getOpportunitiesTool = tool(
  async ({ type, status, limit }) => {
    const opportunities = await prisma.opportunity.findMany({
      where: {
        ...(type && { type: opportunityTypeMap[type.toLowerCase()] ?? (type as OpportunityType) }),
        ...(status && { status: opportunityStatusMap[status.toLowerCase()] ?? (status as OpportunityStatus) }),
      },
      include: {
        organization: { select: { name: true, id: true } },
      },
      orderBy: { probability: "desc" },
      take: toNumber(limit) ?? 20,
    });
    return JSON.stringify(opportunities, null, 2);
  },
  {
    name: "get_opportunities",
    description: "Get growth opportunities with optional filtering.",
    schema: z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      limit: z.union([z.number(), z.string()]).optional(),
    }),
  },
);

const APPROVAL_TYPES = ["EMAIL", "LINKEDIN_POST", "BLOG_POST", "PARTNERSHIP_PROPOSAL", "GRANT_APPLICATION", "INVESTOR_OUTREACH", "CONFERENCE_REGISTRATION", "PITCH_DECK", "NEWSLETTER", "SOCIAL_MEDIA", "WHITEPAPER", "PRESS_RELEASE", "OTHER"] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const EFFORTS = ["LOW", "MEDIUM", "HIGH"] as const;
const AGENT_NAMES = ["QUINN", "SAGE", "NOVA", "ATLAS", "IRIS", "HELIX", "BEACON"] as const;

function toNumber(v: string | number | undefined): number | undefined {
  return v != null ? Number(v) : undefined;
}

function asEnum<T extends string>(val: string, valid: readonly T[], fallback: T): T {
  return valid.includes(val as T) ? (val as T) : fallback;
}

/**
 * Log an agent action for audit trail.
 */
const agentNameMap: Record<string, AgentName> = {
  quinn: AgentName.QUINN,
  sage: AgentName.SAGE,
  nova: AgentName.NOVA,
  atlas: AgentName.ATLAS,
  iris: AgentName.IRIS,
  helix: AgentName.HELIX,
  beacon: AgentName.BEACON,
};

export const logAgentActionTool = tool(
  async ({ agentName, action, input, output }) => {
    await prisma.agentLog.create({
      data: {
        agentName: agentNameMap[agentName.toLowerCase()] ?? (agentName as AgentName),
        action,
        input: input as never,
        output: output as never,
      },
    });
    return "Action logged successfully.";
  },
  {
    name: "log_agent_action",
    description: "Log an agent action to the audit trail.",
    schema: z.object({
      agentName: z.string(),
      action: z.string(),
      input: z.any().optional(),
      output: z.any().optional(),
    }),
  },
);

/**
 * Get analytics snapshots.
 */
export const getAnalyticsSnapshotsTool = tool(
  async ({ period, limit }) => {
    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: period ? { period } : undefined,
      orderBy: { date: "desc" },
      take: toNumber(limit) ?? 10,
    });
    return JSON.stringify(snapshots, null, 2);
  },
  {
    name: "get_analytics_snapshots",
    description: "Get analytics snapshots for tracking performance over time.",
    schema: z.object({
      period: z.string().optional().describe("'daily', 'weekly', or 'monthly'"),
      limit: z.union([z.number(), z.string()]).optional(),
    }),
  },
);
