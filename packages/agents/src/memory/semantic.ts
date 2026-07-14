/**
 * Memory System — Semantic Search with pgvector
 *
 * Provides long-term memory capabilities for all agents using
 * HuggingFace Transformers.js embeddings (runs locally, no API key needed)
 * and PostgreSQL pgvector for similarity search.
 */

import { prisma } from "@quinn/database";
import type { AgentName } from "@quinn/database";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

let embeddings: HuggingFaceTransformersEmbeddings | null = null;

async function getEmbeddings(): Promise<HuggingFaceTransformersEmbeddings> {
  if (!embeddings) {
    embeddings = new HuggingFaceTransformersEmbeddings({
      model: "sentence-transformers/all-MiniLM-L6-v2",
    });
  }
  return embeddings;
}

export function embeddingProvider(): string {
  return "sentence-transformers/all-MiniLM-L6-v2 (local)";
}

/**
 * Generate an embedding vector for the given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const emb = await getEmbeddings();
  return emb.embedQuery(text);
}

/**
 * Store a memory with its embedding for later semantic retrieval.
 */
export async function storeMemory(params: {
  agentName: AgentName;
  category: string;
  content: string;
  metadata?: Record<string, unknown>;
  importance?: number;
}): Promise<string> {
  const embedding = await generateEmbedding(params.content);

  const result = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Memory" (id, "agentName", category, content, embedding, metadata, importance, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      ${params.agentName}::"AgentName",
      ${params.category},
      ${params.content},
      ${embedding}::vector,
      ${JSON.stringify(params.metadata ?? {})}::jsonb,
      ${params.importance ?? 0.5},
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  return result[0]!.id;
}

/**
 * Semantic search — find memories most similar to the query.
 */
export async function searchMemories(params: {
  query: string;
  agentName?: AgentName;
  category?: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<
  {
    id: string;
    agentName: string;
    category: string;
    content: string;
    similarity: number;
    importance: number;
    metadata: unknown;
    createdAt: Date;
  }[]
> {
  const embedding = await generateEmbedding(params.query);
  const limit = params.limit ?? 10;
  const minSimilarity = params.minSimilarity ?? 0.3;

  // Build dynamic WHERE clauses
  let whereClause = `WHERE 1 - (embedding <=> $1::vector) > $2`;
  const queryParams: unknown[] = [embedding, minSimilarity];
  let paramIndex = 3;

  if (params.agentName) {
    whereClause += ` AND "agentName" = $${paramIndex}::"AgentName"`;
    queryParams.push(params.agentName);
    paramIndex++;
  }

  if (params.category) {
    whereClause += ` AND category = $${paramIndex}`;
    queryParams.push(params.category);
    paramIndex++;
  }

  // Use raw query for vector operations
  const results = (await prisma.$queryRawUnsafe(
    `SELECT
      id,
      "agentName",
      category,
      content,
      1 - (embedding <=> $1::vector) AS similarity,
      importance,
      metadata,
      "createdAt"
    FROM "Memory"
    ${whereClause}
    ORDER BY (1 - (embedding <=> $1::vector)) * importance DESC
    LIMIT $${paramIndex}`,
    ...queryParams,
    limit,
  )) as {
    id: string;
    agentName: string;
    category: string;
    content: string;
    similarity: number;
    importance: number;
    metadata: unknown;
    createdAt: Date;
  }[];

  return results;
}

/**
 * Retrieve recent memories for context (non-semantic, chronological).
 */
export async function getRecentMemories(params: {
  agentName?: AgentName;
  category?: string;
  limit?: number;
}): Promise<{
  id: string;
  agentName: string;
  category: string;
  content: string;
  importance: number;
  metadata: unknown;
  createdAt: Date;
}[]> {
  return prisma.memory.findMany({
    where: {
      ...(params.agentName && { agentName: params.agentName }),
      ...(params.category && { category: params.category }),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 20,
    select: {
      id: true,
      agentName: true,
      category: true,
      content: true,
      importance: true,
      metadata: true,
      createdAt: true,
    },
  });
}
