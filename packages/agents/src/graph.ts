/**
 * Quinn CMO — Main LangGraph
 *
 * Wires together all agent nodes into a supervisor-worker graph
 * with conditional routing and PostgreSQL checkpointing.
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { QuinnState } from "./state.js";
import type { QuinnStateType } from "./state.js";
import {
  quinnNode,
  sageNode,
  novaNode,
  atlasNode,
  irisNode,
  helixNode,
  beaconNode,
  synthesizeNode,
} from "./agents/index.js";

/**
 * Normalize input messages from LangGraph Studio.
 * Studio sends plain objects ({ role, content }) instead of BaseMessage instances.
 * This node converts them before they reach any agent.
 */
/**
 * Build the Quinn CMO graph.
 * Call this once at startup and reuse the compiled graph.
 */
export async function buildQuinnGraph(databaseUrl?: string) {
  // Set up PostgreSQL checkpointer for persistent state
  let checkpointer: PostgresSaver | undefined;
  const connString = databaseUrl ?? process.env.DATABASE_URL;

  if (connString) {
    try {
      checkpointer = PostgresSaver.fromConnString(connString);
      await checkpointer.setup();
    } catch (e) {
      console.warn("Could not set up Postgres checkpointer, running without persistence:", (e as Error).message);
    }
  }

  const workflow = new StateGraph(QuinnState)
    // Register all agent nodes
    .addNode("quinn", quinnNode)
    .addNode("sage", sageNode)
    .addNode("nova", novaNode)
    .addNode("atlas", atlasNode)
    .addNode("iris", irisNode)
    .addNode("helix", helixNode)
    .addNode("beacon", beaconNode)
    .addNode("synthesize", synthesizeNode)

    // Entry: hand off to Quinn
    .addEdge("__start__", "quinn")

    // All workers return to Quinn for next delegation decision
    .addEdge("sage", "quinn")
    .addEdge("nova", "quinn")
    .addEdge("atlas", "quinn")
    .addEdge("iris", "quinn")
    .addEdge("helix", "quinn")
    .addEdge("beacon", "quinn")

    // Synthesize ends the workflow
    .addEdge("synthesize", "__end__")

    // Quinn decides where to route next
    .addConditionalEdges("quinn", (state) => {
      const next = state.next;
      if (next === "__end__" || next === END) return "__end__";
      if (["sage", "nova", "atlas", "iris", "helix", "beacon", "synthesize"].includes(next)) {
        return next;
      }
      // Default: end the workflow
      return "__end__";
    });

  return workflow.compile({ checkpointer });
}

/** Type for the compiled graph */
export type QuinnGraph = Awaited<ReturnType<typeof buildQuinnGraph>>;
