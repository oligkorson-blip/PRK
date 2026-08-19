import { NextResponse } from "next/server";
import {
  assertInvestorCanDownload,
  assertStaffCanDownload,
  recordDocumentDownload,
  type DocumentRow
} from "@/lib/documents/queries";
import { getStaffContext } from "@/lib/auth/staff";
import { getSessionUser } from "@/lib/auth/session";
import { getDownloadMetadata } from "@/lib/documents/download";
import { isStorageConfigured, readObject } from "@/lib/storage/local";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  // Auth first: the storage-config probe must not be observable anonymously.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const userId = user.id;

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  try {
    let doc: DocumentRow;
    const staff = await getStaffContext();
    if (staff) {
      const result = await assertStaffCanDownload(id);
      doc = result.doc;
    } else {
      const result = await assertInvestorCanDownload(id);
      doc = result.doc;
    }

    const body = await readObject(doc.storageKey);
    await recordDocumentDownload({ actorUserId: userId, documentId: id });

    const { contentType, filename } = getDownloadMetadata(doc);
    const payload = Uint8Array.from(body);
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(payload.byteLength),
        "X-Content-Type-Options": "nosniff",
        // Authenticated delivery — never cacheable by browser or shared caches.
        "Cache-Control": "no-store, private"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    // 404 for both missing and forbidden documents — no existence oracle.
    if (message === "NOT_FOUND" || message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[documents:download]", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
