import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inArray, and, eq } from "drizzle-orm";

config({ path: path.join(__dirname, "../.env.local") });
config({ path: path.join(__dirname, "../.env") });
import { createDb, assets, interests, holdings, documents } from "../lib/db";
import {
  isMultiIncome,
  validateIncomeMix,
  type IncomeMixEntry
} from "../lib/assets/income-streams";
import { validateInvestmentOptions, type InvestmentOption } from "../lib/assets/investment-options";
import { validateCommercialTermIds, type CommercialTermId } from "../lib/assets/commercial-terms";
import type { OperatorDisplay } from "../lib/assets/operator-display";
import { publicOperatorLabel } from "../lib/assets/operator-display";
import { buildOpportunityStories } from "../lib/assets/opportunity-stories";
import type { MetricProvenance } from "../lib/assets/metric-provenance";
import { assertSeedAllowed } from "../lib/seed/guard";
import { seedAdvisoryCapacityEur } from "../lib/assets/advisory-capacity";
import { resolveObjectPath } from "../lib/storage/local";

function seedCoverCaption(
  siteType: string | null | undefined,
  name: string,
  city: string
): string {
  const place = name.replace(/^(INDIGO|Q-Park|APCOA|Parking)\s+/i, "").trim() || name;
  switch ((siteType ?? "").toLowerCase()) {
    case "airport":
      return `${place} approach in ${city}.`;
    case "station":
      return `${place} station forecourt in ${city}.`;
    case "retail":
      return `${place} retail parking in ${city}.`;
    case "city":
      return `${place} city parking in ${city}.`;
    default:
      return `${place} in ${city}.`;
  }
}

type StaticAsset = {
  id: string;
  name: string;
  operator: string;
  city: string;
  district: string;
  country: string;
  yield: number;
  tier: string;
  from: number;
  spaces: number;
  occupancy: number;
  lease: string;
  blurb: string;
  art: number;
  incomeMix: IncomeMixEntry[];
  siteType?: string;
  operatorDisplay: OperatorDisplay;
  visitorsPerDay: number;
  visitorsProvenance: MetricProvenance;
  availableSpaces: number;
  annualRevenueEur: number;
  revenueProvenance: MetricProvenance;
  commercialTermIds: CommercialTermId[];
  coverImageUrl?: string;
  investmentOptions: InvestmentOption[];
};

const CUT = new Set(["United Kingdom", "Netherlands", "Poland"]);
const seedDataPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-data.json");

/** postgres.js raises PostgresError with code "23503" on FK violation. */
function isFkViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23503";
}

async function main() {
  const gate = assertSeedAllowed();
  if (!gate.ok) {
    console.error(gate.error);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(seedDataPath, "utf8")) as StaticAsset[];

  for (const row of rows) {
    if (CUT.has(row.country)) {
      console.error(`Geo cut violated: ${row.id} in ${row.country}`);
      process.exit(1);
    }
    const mixResult = validateIncomeMix(row.incomeMix);
    if (!mixResult.ok) {
      console.error(`Invalid incomeMix for ${row.id}: ${mixResult.error}`);
      process.exit(1);
    }
    const terms = validateCommercialTermIds(row.commercialTermIds);
    if (!terms.ok) {
      console.error(`Invalid commercialTermIds for ${row.id}: ${terms.error}`);
      process.exit(1);
    }
    const options = validateInvestmentOptions(row.investmentOptions, { mix: row.incomeMix });
    if (!options.ok) {
      console.error(`Invalid investmentOptions for ${row.id}: ${options.error}`);
      process.exit(1);
    }
  }

  if (rows.length < 24) {
    console.error(`Need ≥24 sites after geo cut, got ${rows.length}`);
    process.exit(1);
  }

  const db = createDb();

  const existing = await db.select({ id: assets.id, slug: assets.slug }).from(assets);
  const newSlugs = new Set(rows.map((row) => row.id));
  const removed = existing.filter((row) => !newSlugs.has(row.slug));

  if (removed.length > 0) {
    const removedIds = removed.map((row) => row.id);

    // Removed slugs also own asset documents (ownerType='asset', ownerId=asset.id):
    // fetch the rows first, delete them (with holdings/interests/assets) in one
    // transaction, and unlink the vault files last — a failed delete then never
    // leaves rows pointing at files that are already gone. Unlink errors (unset
    // DOCUMENTS_DIR, missing files) are logged, never fatal.
    const assetDocs = await db
      .select({ id: documents.id, storageKey: documents.storageKey })
      .from(documents)
      .where(and(eq(documents.ownerType, "asset"), inArray(documents.ownerId, removedIds)));

    try {
      // One transaction: a partial wipe (e.g. assets deleted but holdings not)
      // must roll back instead of leaving orphaned rows behind.
      await db.transaction(async (tx) => {
        await tx.delete(holdings).where(inArray(holdings.assetId, removedIds));
        await tx.delete(interests).where(inArray(interests.assetId, removedIds));
        if (assetDocs.length > 0) {
          await tx
            .delete(documents)
            .where(and(eq(documents.ownerType, "asset"), inArray(documents.ownerId, removedIds)));
        }
        await tx.delete(assets).where(inArray(assets.id, removedIds));
      });
    } catch (err) {
      if (isFkViolation(err)) {
        console.error(
          "Refusing db:seed: ops-posted distributions reference holdings for removed asset slugs, so the wipe cannot delete those holdings (distributions.holdingId has no ON DELETE action). Cancel or reassign those distributions on /admin/distributions first, then re-run the seed."
        );
        process.exit(1);
      }
      throw err;
    }

    for (const doc of assetDocs) {
      try {
        await fs.promises.unlink(resolveObjectPath(doc.storageKey));
      } catch (err) {
        console.warn(`db:seed: could not unlink vault file ${doc.storageKey}:`, err);
      }
    }
  }

  for (const row of rows) {
    const publicLabel = publicOperatorLabel(row.operatorDisplay, row.operator);
    const stories = buildOpportunityStories({
      name: row.name,
      city: row.city,
      country: row.country,
      siteType: row.siteType,
      publicOperatorLabel: publicLabel,
      legalName: row.operatorDisplay?.legalName
    });
    const values = {
      slug: row.id,
      name: row.name,
      operator: row.operator,
      city: row.city,
      district: row.district,
      country: row.country,
      targetYieldPct: row.yield.toFixed(2),
      tier: row.tier,
      minTicketEur: row.from,
      spaces: row.spaces,
      occupancyPct: row.occupancy.toFixed(2),
      leaseLabel: row.lease,
      blurb: row.blurb,
      placeStory: stories.placeStory,
      operatorStory: stories.operatorStory,
      demandStory: stories.demandStory,
      numbersNote: stories.numbersNote,
      status: "published" as const,
      artVariant: row.art,
      incomeMix: row.incomeMix,
      visitorsPerDay: row.visitorsPerDay,
      visitorsProvenance: row.visitorsProvenance,
      availableSpaces: row.availableSpaces,
      annualRevenueEur: row.annualRevenueEur,
      revenueProvenance: row.revenueProvenance,
      commercialTermIds: row.commercialTermIds,
      investmentOptions: row.investmentOptions,
      operatorDisplay: row.operatorDisplay,
      siteType: row.siteType ?? null,
      // No uploaded photography — the UI falls back to per-type brand photos.
      coverImageUrl: row.coverImageUrl ?? null,
      coverImageCaption: seedCoverCaption(row.siteType, row.name, row.city),
      galleryImageUrls: [] as string[],
      // Advisory raise target for funding UI (demo/catalogue). Not a committed AUM claim.
      advisoryCapacityEur: seedAdvisoryCapacityEur({
        minTicketEur: row.from,
        spaces: row.spaces
      })
    };

    await db
      .insert(assets)
      .values(values)
      .onConflictDoUpdate({
        target: assets.slug,
        // Seed-managed fields only: status, coverImageUrl, galleryImageUrls and
        // advisoryCapacityEur are ops-managed (lib/assets/admin-actions.ts) —
        // set on insert of a new slug, preserved on conflict.
        set: {
          name: values.name,
          operator: values.operator,
          city: values.city,
          district: values.district,
          country: values.country,
          targetYieldPct: values.targetYieldPct,
          tier: values.tier,
          minTicketEur: values.minTicketEur,
          spaces: values.spaces,
          occupancyPct: values.occupancyPct,
          leaseLabel: values.leaseLabel,
          blurb: values.blurb,
          placeStory: values.placeStory,
          operatorStory: values.operatorStory,
          demandStory: values.demandStory,
          numbersNote: values.numbersNote,
          artVariant: values.artVariant,
          incomeMix: values.incomeMix,
          visitorsPerDay: values.visitorsPerDay,
          visitorsProvenance: values.visitorsProvenance,
          availableSpaces: values.availableSpaces,
          annualRevenueEur: values.annualRevenueEur,
          revenueProvenance: values.revenueProvenance,
          commercialTermIds: values.commercialTermIds,
          investmentOptions: values.investmentOptions,
          operatorDisplay: values.operatorDisplay,
          siteType: values.siteType,
          coverImageCaption: values.coverImageCaption,
          updatedAt: new Date()
        }
      });
  }

  const multiCount = rows.filter((row) => isMultiIncome(row.incomeMix)).length;
  const multiShare = ((multiCount / rows.length) * 100).toFixed(1);
  console.log(
    `Seeded ${rows.length} assets; removed ${removed.length}; multi-income ${multiCount}/${rows.length} (${multiShare}%)`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
