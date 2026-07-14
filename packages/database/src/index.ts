export { prisma } from "./client.js";

export type {
  Organization,
  Contact,
  Relationship,
  ContentItem,
  ContentCalendarEntry,
  Opportunity,
  Approval,
  QuarterlyGoal,
  KeyResult,
  Initiative,
  AnalyticsSnapshot,
  Briefing,
  MarketingAsset,
  Memory,
  AgentLog,
  FounderPreference,
  Campaign,
} from "../generated/client/index.js";

export {
  ApprovalStatus,
  ApprovalType,
  Priority,
  Effort,
  OutreachStatus,
  RelationshipStage,
  ContentStatus,
  ContentType,
  OpportunityType,
  OpportunityStatus,
  GoalStatus,
  AgentName,
  BriefingType,
  PrismaClient,
} from "../generated/client/index.js";
