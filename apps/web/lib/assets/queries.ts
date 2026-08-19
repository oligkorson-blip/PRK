import { asc, count } from "drizzle-orm";
import { assets, db } from "@/lib/db";

/**
 * Read-side data access for the asset catalogue. Plain module (no
 * "use server"): runs inside server pages only; mutations stay in
 * lib/assets/admin-actions.ts.
 */

/** Full catalogue rows for the super-admin assets table. */
export async function listAllAssets() {
  return db.select().from(assets).orderBy(asc(assets.name));
}

/** id + name pairs for admin pickers (e.g. the document upload form). */
export async function listAssetOptions() {
  return db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .orderBy(assets.name);
}

/** Total catalogue size for the super-admin dashboard. */
export async function countAssets(): Promise<number> {
  const rows = await db.select({ value: count() }).from(assets);
  return Number(rows[0]?.value ?? 0);
}
