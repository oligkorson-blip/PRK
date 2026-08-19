import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { documentsRoot } from "@/lib/storage/local";

export const dynamic = "force-dynamic";

/**
 * Readiness probe (compose healthcheck, playwright webServer, deploy checks).
 * Fails loudly: 503 unless the db answers SELECT 1 and DOCUMENTS_DIR is writable.
 * Success body stays exactly { ok: true } — e2e/smoke.spec.ts asserts equality.
 */
async function probeDatabase(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

async function probeDocumentsDir(): Promise<void> {
  const root = documentsRoot();
  await fs.mkdir(root, { recursive: true });
  const probe = path.join(root, `.health-${randomUUID()}`);
  await fs.writeFile(probe, "ok");
  await fs.unlink(probe);
}

export async function GET() {
  try {
    await probeDatabase();
  } catch (error) {
    console.error("[health] database probe failed", error);
    // Generic body — the probe detail stays server-side (same shape as /api/ready).
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    await probeDocumentsDir();
  } catch (error) {
    console.error("[health] documents storage probe failed", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
