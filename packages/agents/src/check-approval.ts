import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "@quinn/database";

async function main() {
  const approvals = await prisma.approval.findMany({
    where: { status: "APPROVED" },
    orderBy: { reviewedAt: "desc" },
    take: 5,
  });
  for (const a of approvals) {
    console.log(`\n=== ${a.title} ===`);
    console.log(`Type: ${a.type}`);
    console.log(`Agent: ${a.agentName}`);
    const content = typeof a.content === "string" ? a.content : JSON.stringify(a.content, null, 2);
    console.log(`Content: ${content.slice(0, 2000)}`);
    console.log(`---`);
  }
  process.exit(0);
}
main().catch(console.error);
