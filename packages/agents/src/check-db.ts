import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "@quinn/database";

async function main() {
  // Check orgs
  const orgs = await prisma.organization.findMany({ take: 3, orderBy: { createdAt: "desc" } });
  console.log("=== Recent Organizations ===");
  for (const o of orgs) {
    console.log(`${o.name} | ${o.website || "no site"} | priority: ${o.priorityScore}`);
  }

  // Check contacts
  const contacts = await prisma.contact.findMany({ take: 3, orderBy: { createdAt: "desc" } });
  console.log("\n=== Recent Contacts ===");
  for (const c of contacts) {
    console.log(`${c.firstName} ${c.lastName} | ${c.email || "no email"} | org: ${c.organizationId}`);
  }

  // Check opportunities
  const opps = await prisma.opportunity.findMany({ take: 5, orderBy: { createdAt: "desc" } });
  console.log("\n=== Recent Opportunities ===");
  for (const o of opps) {
    console.log(`${o.type} | ${o.title} | status: ${o.status} | score: ${o.strategicFit}/${o.revenuePotential}`);
  }

  process.exit(0);
}
main().catch(console.error);
