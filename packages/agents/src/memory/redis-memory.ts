import { AgentMemory } from "@redis-iris/agent-memory";

let client: AgentMemory | null = null;

function getClient(): AgentMemory {
  if (!client) {
    const serverURL = process.env.AGENT_MEMORY_BASE_URL;
    const storeId = process.env.AGENT_MEMORY_STORE_ID;
    const apiKey = process.env.AGENT_MEMORY_API_KEY;

    if (!serverURL || !storeId || !apiKey) {
      throw new Error(
        "Redis Agent Memory not configured. Set AGENT_MEMORY_BASE_URL, AGENT_MEMORY_STORE_ID, and AGENT_MEMORY_API_KEY.",
      );
    }

    client = new AgentMemory({ serverURL, storeId, apiKey });
  }
  return client;
}

export function isConfigured(): boolean {
  return !!(process.env.AGENT_MEMORY_BASE_URL && process.env.AGENT_MEMORY_STORE_ID && process.env.AGENT_MEMORY_API_KEY);
}

export async function storeSessionEvent(params: {
  sessionId: string;
  actorId: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  text: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isConfigured()) return null;

  const res = await getClient().addSessionEvent({
    sessionId: params.sessionId,
    actorId: params.actorId,
    role: params.role,
    content: [{ text: params.text }],
    createdAt: new Date(),
    metadata: params.metadata,
  });
  return res.event;
}

export async function searchLongTermMemory(params: {
  query: string;
  ownerId: string;
  namespace?: string;
  limit?: number;
  similarityThreshold?: number;
}) {
  if (!isConfigured()) return [];

  const res = await getClient().searchLongTermMemory({
    text: params.query,
    similarityThreshold: params.similarityThreshold ?? 0.7,
    filterOp: "all",
    filter: {
      ownerId: { eq: params.ownerId },
      ...(params.namespace ? { namespace: { eq: params.namespace } } : {}),
    },
    limit: params.limit ?? 10,
  });
  return res.items;
}

export async function health(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    await getClient().health();
    return true;
  } catch {
    return false;
  }
}
