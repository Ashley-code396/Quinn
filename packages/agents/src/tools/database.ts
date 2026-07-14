/**
 * Database Tools
 *
 * Tools that agents use to query and update the Prisma database.
 * These are wrapped as LangChain tools for use in agent toolkits.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@quinn/database";

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
          status ? { outreachStatus: status as never } : {},
        ],
      },
      orderBy: { priorityScore: "desc" },
      take: limit ?? 10,
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
      limit: z.number().optional().describe("Max results to return (default 10)"),
    }),
  },
);

/**
 * Create or update an organization profile.
 */
export const upsertOrganizationTool = tool(
  async (params) => {
    const { id, ...data } = params;
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
      priorityScore: z.number().optional(),
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
      take: limit ?? 20,
    });
    return JSON.stringify(approvals, null, 2);
  },
  {
    name: "get_pending_approvals",
    description: "Get all pending approval requests that need human review.",
    schema: z.object({
      limit: z.number().optional().describe("Max results (default 20)"),
    }),
  },
);

/**
 * Create an approval request.
 */
export const createApprovalTool = tool(
  async (params) => {
    const approval = await prisma.approval.create({
      data: params as never,
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
      confidence: z.number().describe("Confidence score 0-100"),
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
      take: limit ?? 20,
    });
    return JSON.stringify(items, null, 2);
  },
  {
    name: "get_content_items",
    description: "Get content items from the database with optional filtering.",
    schema: z.object({
      type: z.string().optional().describe("Content type filter"),
      status: z.string().optional().describe("Content status filter"),
      limit: z.number().optional().describe("Max results"),
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
    cutoff.setDate(cutoff.getDate() + (daysAhead ?? 7));
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
      daysAhead: z.number().optional().describe("Days ahead to check (default 7)"),
    }),
  },
);

/**
 * Get opportunities.
 */
export const getOpportunitiesTool = tool(
  async ({ type, status, limit }) => {
    const opportunities = await prisma.opportunity.findMany({
      where: {
        ...(type && { type: type as never }),
        ...(status && { status: status as never }),
      },
      include: {
        organization: { select: { name: true, id: true } },
      },
      orderBy: { probability: "desc" },
      take: limit ?? 20,
    });
    return JSON.stringify(opportunities, null, 2);
  },
  {
    name: "get_opportunities",
    description: "Get growth opportunities with optional filtering.",
    schema: z.object({
      type: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
    }),
  },
);

/**
 * Log an agent action for audit trail.
 */
export const logAgentActionTool = tool(
  async ({ agentName, action, input, output }) => {
    await prisma.agentLog.create({
      data: {
        agentName: agentName as never,
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
      take: limit ?? 10,
    });
    return JSON.stringify(snapshots, null, 2);
  },
  {
    name: "get_analytics_snapshots",
    description: "Get analytics snapshots for tracking performance over time.",
    schema: z.object({
      period: z.string().optional().describe("'daily', 'weekly', or 'monthly'"),
      limit: z.number().optional(),
    }),
  },
);
