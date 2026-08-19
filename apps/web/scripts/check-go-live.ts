import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });
import { createDb, assets } from "../lib/db";
import { isDemoMode } from "../lib/demo-mode";

const seedDataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-data.json");

/**
 * Go-live gate: with DEMO_MODE=false/0 the deployment markets its catalogue as
 * real investments, so the seeded demo catalogue (real trademarks) must be gone
 * from the assets table — otherwise the site is an unlawful public financial
 * promotion. Exits non-zero when any seed-data.json slug is still present.
 */
async function main() {
  if (isDemoMode()) {
    console.log("check:go-live: DEMO_MODE is demo — seeded catalogue allowed.");
    process.exit(0);
  }

  const rows = JSON.parse(fs.readFileSync(seedDataPath, "utf8")) as { id: string }[];
  const seedSlugs = rows.map((row) => row.id);

  const db = createDb();
  const matches = await db
    .select({ slug: assets.slug })
    .from(assets)
    .where(inArray(assets.slug, seedSlugs));

  if (matches.length > 0) {
    console.error(
      `Refusing go-live: DEMO_MODE=${process.env.DEMO_MODE} but ${matches.length} seeded demo asset slug(s) are still in the assets table: ${matches
        .map((row) => row.slug)
        .join(", ")}. Marketing the seeded catalogue as real investments is an unlawful public financial promotion. Remove these assets (or replace the catalogue with licensed real deals) before setting DEMO_MODE=false.`
    );
    process.exit(1);
  }

  console.log(
    `check:go-live: OK — DEMO_MODE=${process.env.DEMO_MODE} and none of the ${seedSlugs.length} seeded slugs are present.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
