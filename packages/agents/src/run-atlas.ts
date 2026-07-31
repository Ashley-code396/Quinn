import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { runAtlasAutonomous } from "./index.js";

async function main() {
  console.log("🚀 Running Atlas to find prospects and draft outreach...\n");
  const result = await runAtlasAutonomous(
    "CRITICAL: Find 3 small-medium skincare brands that would benefit from anti-counterfeit authentication. " +
    "For EACH brand: (1) Get their company name and website via web search, (2) Save them to the database using upsert_organization, " +
    "(3) Find the CEO or founder email, (4) Draft a personalized outreach email with subject and body, " +
    "(5) Create an EMAIL approval with the full email draft. " +
    "Be very specific - real companies, real websites, personalized emails. " +
    "Brands to research: Glow Recipe, Youth To The People, Bubble Skincare, Byoma, Dieux Skin. " +
    "Create one approval per brand with the email draft as the content."
  );
  console.log("\n✅ Done. Result:");
  console.log(typeof result === "string" ? result.slice(0, 3000) : JSON.stringify(result).slice(0, 3000));
  process.exit(0);
}
main().catch(console.error);
