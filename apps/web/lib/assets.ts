import { and, asc, eq } from "drizzle-orm";
import { assets, db } from "@/lib/db";

export type Asset = typeof assets.$inferSelect;

export async function listPublishedAssets(): Promise<Asset[]> {
  return db
    .select()
    .from(assets)
    .where(eq(assets.status, "published"))
    .orderBy(asc(assets.name));
}

export async function getPublishedAssetBySlug(slug: string): Promise<Asset | null> {
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.slug, slug), eq(assets.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

export function assetLocationLabel(asset: Pick<Asset, "city" | "country">): string {
  return `${asset.city}, ${asset.country}`;
}
