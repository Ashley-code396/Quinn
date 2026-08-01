/**
 * Helix — Presentation & Asset Agent
 */

import { createModel, withFallback } from "../llm.js";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { QuinnStateType } from "../state.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { createApprovalTool, logAgentActionTool, generatePdfTool, generateSlidesTool, submitWebFormTool, registerForEventTool } from "../tools/index.js";
import { searchMemories, storeMemory } from "../memory/index.js";
import { lastMessageType } from "../messages.js";

const HELIX_CONTEXT = `
# Asset Types
Generate: pitch decks, investor decks, sales decks, partnership proposals,
one-pagers, brochures, conference presentations, grant applications.

**Generate actual files — not just text.** Use generate_pdf for documents and
generate_slides for presentations. Always submit the generated file for approval
via create_approval with the file path included in the content.

Keep messaging consistent with brand. Tailor to audience. Include CTAs.

# Pitch Decks & Presentations
When creating a pitch deck:
1. Use generate_slides to create the actual .pptx file with full slide content
2. Every slide must have: heading, full body text with bullet points, specific data/numbers
3. Include concrete metrics: market sizing ($75B counterfeit market, $189B skincare market), Dermaqea's specific traction, team credentials
4. Structure: problem → solution → technology → market → traction → business model → financials → team → ask → contact
5. After generating the file, call create_approval with type PITCH_DECK containing the file path and full slide content for review

# One-Pagers, Brochures & Whitepapers
When creating a document:
1. Use generate_pdf to create the actual .pdf file with structured content
2. Structure: title, key points, supporting data, CTA
3. After generating the file, call create_approval with the appropriate type containing the file path

# Proactive Asset Generation
When the system identifies an opportunity (partnership, grant, conference):
1. Immediately generate the relevant asset (PDF or slides) using generate_pdf or generate_slides
2. Submit for approval via create_approval with the file path included
3. Do not wait to be asked — if there's a pending opportunity, prepare materials proactively

# Conference & Event Registration
When asked to register for a conference or event:
1. Use register_for_event tool — it has Dermaqea's default info baked in (name, email, company)
2. Pass the event URL from the opportunity Atlas found
3. If the registration form has extra fields not covered by defaults, use additionalFields parameter
4. After registration, submit for approval via create_approval with type CONFERENCE_REGISTRATION including the event name and confirmation details

# Web Form Filling
For any web-based form (grant applications, newsletter signups, partner portals):
1. Use submit_web_form with the page URL and field mappings
2. Map form field labels/names to Dermaqea's info
3. Submit for approval after successful fill so the user can review

# Dermaqea Company Details (for forms & applications)
- Company name: Dermaqea
- Website: dermaqea.vercel.app
- Short description: Invisible cryptographic authentication for premium skincare packaging — eliminating counterfeits with a smartphone scan.
- Long description: Dermaqea embeds invisible cryptographic signatures into packaging artwork, letting consumers verify product authenticity instantly via smartphone. We address the $75B counterfeit cosmetics crisis that endangers consumer health and erodes brand trust.
- Year founded: 2025
- HQ country: United States
- Employees: 0-5
- Stage: Pre-Seed
- Innovation team fit: Luxury / Dermatological Skincare / Supply Chain Security

# Application Portal Form Filling
When asked to fill in an application form, you will receive the form fields (e.g., 1. Company name, 2. Website URL, etc.). For each field:
- Fill it in with Dermaqea's actual information from the section above
- Do NOT leave placeholders like [Insert year] or [Select option] — use the real values
- For fields requiring a choice (like employee count or stage), select the correct option
- After completing all fields, call 'create_approval' with type GRANT_APPLICATION or PARTNERSHIP_PROPOSAL containing the full filled-in form so the user can review and submit

# Proactive Drafting
When asked to prepare a proposal, grant application, or deck:
1. Draft the complete content with all details — full slide text, every section, every data point
2. Call 'create_approval' with the appropriate type (GRANT_APPLICATION, PARTNERSHIP_PROPOSAL, PITCH_DECK) to submit it for human approval
3. The content field of create_approval MUST contain the ENTIRE draft — not just a summary. The user needs to see the full document text when they click "View Full Content"
4. Do NOT just say "I'll prepare it" — actually draft it and submit for approval
5. Minimum 1000 characters for any deck or proposal content — include all specific numbers, names, and details

# Rules
- Always call 'create_approval' with full detailed draft content — never just a short summary or description
- Use type PITCH_DECK for investor materials, PARTNERSHIP_PROPOSAL for partner materials, GRANT_APPLICATION for grant proposals
- Include a clear title, the COMPLETE drafted content (not just an outline), and why this matters now
- For application forms: fill in EVERY field with Dermaqea's real info — no blank fields, no placeholders
- CRITICAL: The content you pass to create_approval is what the CEO sees when they click "View Full Content." Make it complete and detailed.
`;

export async function helixNode(state: QuinnStateType): Promise<Partial<QuinnStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const taskDesc = lastMessage?.content?.toString() ?? "prepare marketing materials";

  const memories = await (async () => {
    try {
      return await searchMemories({ query: taskDesc, limit: 8 });
    } catch (e) {
      console.warn("Memory search failed, continuing without it:", (e as Error).message);
      return [];
    }
  })();
  const memCtx = memories.length > 0
    ? `\n# Relevant Knowledge & Previous Materials\n${memories.map((m) => `[${m.category}] ${m.content}`).join("\n")}`
    : "";

  const helixTools = [createApprovalTool, logAgentActionTool, generatePdfTool, generateSlidesTool, submitWebFormTool, registerForEventTool];

  const helixMessages = [
    new SystemMessage(buildSystemPrompt("helix", HELIX_CONTEXT + memCtx)),
    ...state.messages.slice(-5),
  ];
  if (lastMessageType(helixMessages) !== "human") {
    helixMessages.push(new HumanMessage("Proceed with marketing materials preparation."));
  }
  let response = await withFallback(
    async (model) => {
      const modelWithTools = model.bindTools(helixTools);
      return await modelWithTools.invoke(helixMessages);
    },
    { temperature: 0.3 },
  );


  if (response.tool_calls?.length) {
    const toolResults: string[] = [];
    for (const tc of response.tool_calls) {
      const tool = helixTools.find(t => t.name === tc.name);
      if (!tool) continue;
      try {
        const result = await (tool as any).invoke(tc.args);
        toolResults.push(`${tc.name} returned:\n${typeof result === "string" ? result.slice(0, 2000) : JSON.stringify(result).slice(0, 2000)}`);
      } catch (err) {
        toolResults.push(`${tc.name} failed: ${(err as Error).message}`);
      }
    }
    const existingContent = response.content?.toString()?.trim() || "Tools executed.";
    const followUp = new HumanMessage(
      `You called tools and got these results:\n\n${toolResults.join("\n\n")}\n\nYour previous message was: ${existingContent.slice(0, 1000)}\n\nNow summarize what you did and what was created.`
    );
    response = await withFallback(
      async (model) => model.invoke([...helixMessages, response, followUp]),
      { temperature: 0.3 },
    );
  }

  const helixContent = response.content?.toString()?.trim() || "Asset preparation complete.";

  if (helixContent.length > 50) {
    await storeMemory({ agentName: "HELIX", category: "materials", content: helixContent.slice(0, 2000), importance: 0.5 }).catch(() => {});
  }

  return {
    next: "quinn",
    messages: [new AIMessage({ content: helixContent, name: "helix" })],
    agentReports: [{ agentName: "helix", summary: "Presentation & asset report", findings: [helixContent], recommendations: [], actionItems: [], timestamp: new Date() }],
  };
}

