/**
 * Standalone CLI wrapper around lib/seed.ts, for seeding without going
 * through the running app. The app itself calls resetAndSeedDemo()
 * directly via POST /api/demo/reset.
 *
 * Run with: npx tsx scripts/seed-demo.ts
 */
import "dotenv/config";
import { resetAndSeedDemo } from "../lib/seed";

resetAndSeedDemo()
  .then(({ decision, assumption }) => {
    console.log("Seeded decision:", decision._id.toString());
    console.log("Seeded assumption:", assumption._id.toString());
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
