/**
 * Quinn Agent State
 *
 * The shared state that flows through the entire LangGraph.
 * All agents read from and write to this state.
 */

import { Annotation, END } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type {
  AgentNameType,
  Recommendation,
  Alert,
  AgentReport,
} from "@quinn/shared";

/**
 * Main graph state for the Quinn CMO system.
 */
export const QuinnState = Annotation.Root({
  /** Conversation message history */
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, incoming) => existing.concat(incoming),
    default: () => [],
  }),

  /** Which agent to route to next (or END) */
  next: Annotation<string>({
    reducer: (_prev, next) => next ?? END,
    default: () => END,
  }),

  /** The original task/trigger that started this workflow */
  trigger: Annotation<string>({
    reducer: (_prev, next) => next ?? "",
    default: () => "",
  }),

  /** Current quarterly goals context */
  quarterlyGoalsContext: Annotation<string>({
    reducer: (_prev, next) => next ?? "",
    default: () => "",
  }),

  /** Reports collected from worker agents during this run */
  agentReports: Annotation<AgentReport[]>({
    reducer: (existing, incoming) => existing.concat(incoming),
    default: () => [],
  }),

  /** Recommendations accumulated during this run */
  recommendations: Annotation<Recommendation[]>({
    reducer: (existing, incoming) => existing.concat(incoming),
    default: () => [],
  }),

  /** Alerts raised during this run */
  alerts: Annotation<Alert[]>({
    reducer: (existing, incoming) => existing.concat(incoming),
    default: () => [],
  }),

  /** Number of agent delegation rounds (prevent infinite loops) */
  iterationCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  /** Track which agents have been consulted in this workflow */
  consultedAgents: Annotation<AgentNameType[]>({
    reducer: (existing, incoming) => {
      const set = new Set([...existing, ...incoming]);
      return Array.from(set);
    },
    default: () => [],
  }),
});

export type QuinnStateType = typeof QuinnState.State;

/** Maximum number of agent delegation rounds per workflow */
export const MAX_ITERATIONS = 12;
