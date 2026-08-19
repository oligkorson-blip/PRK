import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentsRoot } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // These columns/tables are from the newest committed migrations. A plain
    // SELECT 1 would report ready even when deploy migrations were skipped.
    await db.execute(sql`select "cover_image_url", "gallery_image_urls" from "assets" limit 0`);
    await db.execute(sql`select "idempotency_key" from "distributions" limit 0`);
    await db.execute(sql`select "deactivated_at" from "staff_profiles" limit 0`);

    const root = documentsRoot();
    await mkdir(root, { recursive: true });
    await access(root, constants.R_OK | constants.W_OK);

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[readiness] dependency check failed", error);
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
