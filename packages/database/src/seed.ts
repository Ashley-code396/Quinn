import { prisma } from "./client.js";
import {
  AgentName,
  ContentType,
  ContentStatus,
  Priority,
  GoalStatus,
} from "../generated/client/index.js";

/**
 * Seed script — populates Quinn's initial context about Dermaqea
 * Run with: pnpm db:seed
 */
async function main() {
  console.log("Seeding Quinn's initial knowledge...\n");

  // ---- Founder Preferences ----
  const preferences = [
    {
      category: "brand_guidelines",
      key: "company_name",
      value: "Dermaqea",
      notes: "Always capitalize as 'Dermaqea'",
    },
    {
      category: "brand_guidelines",
      key: "tagline",
      value: "The trust layer for the skincare industry",
    },
    {
      category: "brand_guidelines",
      key: "mission",
      value:
        "Enable brands to authenticate products using invisible cryptographic signatures embedded directly into packaging artwork, eliminating counterfeit skincare products while improving consumer trust and post-purchase engagement.",
    },
    {
      category: "brand_guidelines",
      key: "vision",
      value:
        "Become the global standard for skincare authenticity.",
    },
    {
      category: "brand_guidelines",
      key: "technology_summary",
      value:
        "Invisible cryptographic authentication embedded into product packaging artwork. No visible QR codes or scratch labels required. Consumers verify authenticity through a seamless scan experience.",
    },
    {
      category: "brand_guidelines",
      key: "differentiator",
      value:
        "Unlike visible authentication methods (QR codes, holograms, scratch labels), Dermaqea's technology is invisible and embedded directly into existing packaging artwork, preserving brand aesthetics while providing superior anti-counterfeit protection.",
    },
    {
      category: "tone",
      key: "voice",
      value:
        "Professional, authoritative, innovative. Speak as industry experts, not as a startup begging for attention. Confident but not arrogant. Technical but accessible.",
    },
    {
      category: "tone",
      key: "avoid",
      value:
        "Overly casual language, buzzword-heavy marketing speak, fear-mongering about counterfeits without offering solutions, comparing negatively to specific competitors by name.",
    },
    {
      category: "priorities",
      key: "target_industries",
      value:
        "Skincare brands, cosmetic manufacturers, pharmaceutical companies, beauty retailers, luxury brands, packaging companies",
    },
    {
      category: "priorities",
      key: "target_regions",
      value:
        "Global, with initial focus on markets with high counterfeit incidence: Southeast Asia, Africa, Middle East, Europe, North America",
    },
    {
      category: "priorities",
      key: "stage",
      value: "Early-stage startup, pre-revenue, building partnerships and market presence",
    },
    {
      category: "content_style",
      key: "linkedin_format",
      value:
        "Hook-driven opening line, short paragraphs (1-2 sentences), data points where possible, clear call-to-action, relevant hashtags (3-5 max). Mix of thought leadership, educational content, and company updates.",
    },
  ];

  for (const pref of preferences) {
    await prisma.founderPreference.upsert({
      where: {
        category_key: { category: pref.category, key: pref.key },
      },
      update: { value: pref.value, notes: pref.notes },
      create: pref,
    });
  }
  console.log(`  Seeded ${preferences.length} founder preferences`);

  // ---- Initial Quarterly Goals ----
  const q3Goal = await prisma.quarterlyGoal.upsert({
    where: { id: "initial-q3-2026" },
    update: {},
    create: {
      id: "initial-q3-2026",
      quarter: "2026-Q3",
      title: "Establish Dermaqea as a Thought Leader in Skincare Authentication",
      description:
        "Build Dermaqea's brand presence, generate initial partnerships, and create a content engine that positions us as the authority on skincare product authentication.",
      status: GoalStatus.IN_PROGRESS,
      progress: 0,
      keyResults: {
        create: [
          {
            title: "Grow LinkedIn followers to 1,000",
            targetValue: 1000,
            currentValue: 0,
            unit: "followers",
            status: GoalStatus.IN_PROGRESS,
          },
          {
            title: "Publish 12 thought leadership pieces",
            targetValue: 12,
            currentValue: 0,
            unit: "articles",
            status: GoalStatus.PLANNED,
          },
          {
            title: "Secure 3 pilot partnership conversations",
            targetValue: 3,
            currentValue: 0,
            unit: "partnerships",
            status: GoalStatus.PLANNED,
          },
          {
            title: "Apply to 5 relevant accelerators or grants",
            targetValue: 5,
            currentValue: 0,
            unit: "applications",
            status: GoalStatus.PLANNED,
          },
          {
            title: "Generate 50 qualified research profiles",
            targetValue: 50,
            currentValue: 0,
            unit: "profiles",
            status: GoalStatus.PLANNED,
          },
        ],
      },
    },
  });
  console.log(`  Seeded Q3 2026 quarterly goals with ${5} key results`);

  // ---- Initial Memory Context ----
  const memories = [
    {
      agentName: AgentName.QUINN,
      category: "company_context",
      content:
        "Dermaqea is an early-stage startup building invisible cryptographic authentication for skincare product packaging. The technology embeds authentication directly into packaging artwork without visible QR codes or scratch labels. The long-term vision is to become the global standard for skincare authenticity. Current stage: pre-revenue, focused on building partnerships, brand awareness, and securing pilot customers.",
      importance: 1.0,
    },
    {
      agentName: AgentName.QUINN,
      category: "strategic_context",
      content:
        "The global counterfeit cosmetics market is estimated at $75 billion annually. Key pain points for brands include consumer safety risks, brand reputation damage, revenue loss, and regulatory compliance. Dermaqea's invisible authentication addresses the aesthetic concerns that have limited adoption of traditional anti-counterfeit solutions like QR codes and holograms.",
      importance: 0.9,
    },
    {
      agentName: AgentName.SAGE,
      category: "research_context",
      content:
        "Key competitor categories to monitor: visible authentication (QR codes, holograms), blockchain-based tracking (VeChain, OriginTrail), AI-powered detection (Entrupy), and packaging-integrated solutions (Ennoventure, Scantrust). Dermaqea's unique angle is invisible, artwork-embedded authentication without consumer friction.",
      importance: 0.9,
    },
    {
      agentName: AgentName.NOVA,
      category: "content_context",
      content:
        "Content pillars for Dermaqea: (1) Counterfeit awareness — statistics, case studies, consumer risk (2) Authentication technology — how invisible crypto works, comparisons (3) Brand trust — why authenticity matters for brand loyalty (4) Industry insights — skincare market trends, regulation changes (5) Founder journey — startup building in public, milestones",
      importance: 0.85,
    },
  ];

  for (const mem of memories) {
    await prisma.memory.create({ data: mem });
  }
  console.log(`  Seeded ${memories.length} initial memory entries`);

  console.log("\nSeed complete! Quinn is ready to work.\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
