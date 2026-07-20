/**
 * Knowledge Capture Pipeline
 *
 * Every incoming piece of information from the CEO gets processed through
 * this pipeline: classify → extract → embed → store → task → strategize.
 */

import { createModel, withFallback } from "../llm.js";
import { storeMemory, searchMemories, generateEmbedding } from "../memory/index.js";
import type { AgentName } from "@quinn/database";

export type KnowledgeCategory =
  | "opportunity"
  | "marketing"
  | "product"
  | "competitor"
  | "customer"
  | "founder_insight"
  | "research"
  | "general";

export interface ClassificationResult {
  category: KnowledgeCategory;
  subcategory: string;
  summary: string;
  entities: { type: string; name: string }[];
  importance: number;
  reasoning: string;
  suggestedAgents: string[];
  isUrgent: boolean;
}

const CLASSIFICATION_PROMPT = `You are Quinn's knowledge engine. Analyze the following message from Dermaqea's founder.

Classify it into exactly one category:
- opportunity: grants, accelerators, investors, conferences, partnerships, funding
- marketing: campaigns, branding, LinkedIn, SEO, storytelling, content ideas
- product: features, roadmap, user feedback, product ideas
- competitor: competitor launches, funding, acquisitions, technology, news
- customer: complaints, testimonials, requests, pain points
- founder_insight: random thoughts, vision, ideas, questions, business model improvements, personal reflections
- research: articles, whitepapers, academic papers, videos, case studies, technical discoveries
- general: anything that doesn't fit above

Return JSON:
{
  "category": "one of the above",
  "subcategory": "more specific subcategory (e.g. 'grant', 'linkedin_strategy', 'competitor_launch')",
  "summary": "1-2 sentence summary capturing the key information",
  "entities": [{"type": "person|organization|date|event|technology", "name": "entity name"}],
  "importance": 0.0-1.0 (0=trivial note, 1=strategically critical),
  "reasoning": "why this matters to Dermaqea",
  "suggestedAgents": ["sage", "nova", "atlas", "iris", "helix", "beacon"] (which agents should act on this),
  "isUrgent": false
}`;

const STRATEGIC_PROMPT = `You are Quinn's strategic reasoning engine. Evaluate this new information and determine its impact.

Current knowledge: {context}

New information: {input}

Analyze:
1. Does this change our strategy?
2. Does this affect OKRs?
3. Should marketing priorities change?
4. Should product priorities change?
5. Should this become an alert?
6. Should this become a recommendation?

Return JSON:
{
  "strategyChange": "none|minor|significant",
  "strategyChangeReason": "explanation if any",
  "affectsOKRs": false,
  "okrImpact": "which OKRs and how",
  "marketingImpact": "none|minor|significant",
  "productImpact": "none|minor|significant",
  "shouldAlert": false,
  "shouldRecommend": false,
  "alertMessage": "if shouldAlert, the alert text",
  "recommendation": "if shouldRecommend, the recommendation text",
  "notifyDepartments": []
}`;

const TASK_CREATION_PROMPT = `You are Quinn's task delegation engine. Given new knowledge and its classification, determine what tasks to create for specialist agents.

Knowledge: {summary}
Category: {category}
Entities: {entities}
Suggested agents: {suggestedAgents}

Create specific task instructions for each relevant agent. Only assign tasks that are clearly warranted.

Return JSON:
{
  "tasks": [
    {
      "agent": "sage|nova|atlas|iris|helix|beacon",
      "action": "what to do",
      "reasoning": "why this task is needed",
      "priority": "low|medium|high|critical"
    }
  ]
}`;

async function classify(text: string): Promise<ClassificationResult> {
  const response = await withFallback(
    async (model) => model.invoke([
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: text },
    ]),
    { temperature: 0.1 },
  );

  const content = response.content?.toString() ?? "{}";
  const json = extractJson(content) as Record<string, unknown>;

  return {
    category: (json.category as KnowledgeCategory) ?? "general",
    subcategory: (json.subcategory as string) ?? "general",
    summary: (json.summary as string) ?? text.slice(0, 200),
    entities: (json.entities as { type: string; name: string }[]) ?? [],
    importance: typeof json.importance === "number" ? json.importance : 0.5,
    reasoning: (json.reasoning as string) ?? "",
    suggestedAgents: (json.suggestedAgents as string[]) ?? [],
    isUrgent: (json.isUrgent as boolean) ?? false,
  };
}

async function evaluateStrategicImpact(
  text: string,
  context: string,
): Promise<Record<string, unknown>> {
  const prompt = STRATEGIC_PROMPT.replace("{input}", text).replace("{context}", context);

  const response = await withFallback(
    async (model) => model.invoke([
      { role: "system", content: prompt },
      { role: "user", content: "Evaluate this information." },
    ]),
    { temperature: 0.1 },
  );

  const content = response.content?.toString() ?? "{}";
  return extractJson(content) as Record<string, unknown>;
}

async function createTasks(
  summary: string,
  category: string,
  entities: { type: string; name: string }[],
  suggestedAgents: string[],
): Promise<{ agent: string; action: string; reasoning: string; priority: string }[]> {
  const prompt = TASK_CREATION_PROMPT
    .replace("{summary}", summary)
    .replace("{category}", category)
    .replace("{entities}", JSON.stringify(entities))
    .replace("{suggestedAgents}", JSON.stringify(suggestedAgents));

  const response = await withFallback(
    async (model) => model.invoke([
      { role: "system", content: prompt },
      { role: "user", content: "Create tasks based on this knowledge." },
    ]),
    { temperature: 0.1 },
  );

  const content = response.content?.toString() ?? '{"tasks": []}';
  const json = extractJson(content) as { tasks?: { agent: string; action: string; reasoning: string; priority: string }[] };
  return json.tasks ?? [];
}

function extractJson(text: string): Record<string, unknown> {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {}
  return {} as Record<string, unknown>;
}

async function retrieveRelevantContext(text: string): Promise<string> {
  const memories = await searchMemories({ query: text, limit: 5 });
  if (memories.length === 0) return "No existing context found.";
  return memories
    .map((m) => `[${m.category}] (importance: ${m.importance}) ${m.content}`)
    .join("\n");
}

export async function processKnowledge(
  rawText: string,
  source: string = "telegram",
): Promise<{
  classification: ClassificationResult;
  memoryId: string;
  tasks: { agent: string; action: string; reasoning: string; priority: string }[];
  strategicImpact: Record<string, unknown>;
}> {
  const classification = await classify(rawText);

  const summary = classification.summary;
  const enrichedContent = `[Source: ${source}]\n[Category: ${classification.category}/${classification.subcategory}]\n[Importance: ${classification.importance}]\n\nOriginal: ${rawText}\n\nSummary: ${summary}\nEntities: ${JSON.stringify(classification.entities)}\nReasoning: ${classification.reasoning}`;

  const memoryId = await storeMemory({
    agentName: "QUINN",
    category: classification.category,
    content: enrichedContent.slice(0, 3000),
    metadata: {
      source,
      rawText: rawText.slice(0, 1000),
      classification: classification.category,
      subcategory: classification.subcategory,
      entities: classification.entities,
      reasoning: classification.reasoning,
      isUrgent: classification.isUrgent,
      suggestedAgents: classification.suggestedAgents,
    },
    importance: classification.importance,
  });

  const relevantContext = await retrieveRelevantContext(rawText);

  const [tasks, strategicImpact] = await Promise.all([
    createTasks(summary, classification.category, classification.entities, classification.suggestedAgents),
    evaluateStrategicImpact(rawText, relevantContext),
  ]);

  console.log(
    `🧠 Knowledge captured: [${classification.category}/${classification.subcategory}] ` +
      `importance=${classification.importance} ` +
      `agents=${classification.suggestedAgents.join(",")} ` +
      `tasks=${tasks.length} ` +
      `strategy_change=${strategicImpact.strategyChange ?? "none"}`,
  );

  return { classification, memoryId, tasks, strategicImpact };
}
