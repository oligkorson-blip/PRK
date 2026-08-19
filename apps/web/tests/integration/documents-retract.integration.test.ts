/**
 * Integration tests for document retraction — retractDocument plus the
 * visibility rules (investor listing, investor/staff download gates, admin
 * listing) — against a real Postgres scratch database. Only the session is
 * mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sessionState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => sessionState.user),
  requireSessionUser: vi.fn(async () => {
    if (!sessionState.user) throw new Error("UNAUTHENTICATED");
    return sessionState.user;
  })
}));

import { retractDocument } from "@/lib/documents/actions";
import {
  assertInvestorCanDownload,
  assertStaffCanDownload,
  listDocumentsForAdmin,
  listDocumentsForInvestor
} from "@/lib/documents/queries";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createAsset,
  createDocument,
  createInterestRow,
  createInvestor,
  createStaff,
  getDocument,
  listAuditEvents,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

describeIntegration("document retraction (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Awaited<ReturnType<typeof createStaff>>;

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  /** Investor with an interest on an asset, plus a published asset doc. */
  async function makeInvestorWithAssetDoc() {
    const { investor, authUser } = await createInvestor({ email: uniqEmail("inv") });
    const asset = await createAsset();
    await createInterestRow({ investorId: investor.id, assetId: asset.id, status: "pending" });
    const doc = await createDocument({
      ownerType: "asset",
      ownerId: asset.id,
      uploadedBy: admin.authUser.id
    });
    return { investor, authUser, asset, doc };
  }

  it("super_admin retracts a document; the row is stamped and audited", async () => {
    const { doc } = await makeInvestorWithAssetDoc();
    signInAs(admin.authUser);

    const result = await retractDocument({ documentId: doc.id });

    expect(result).toEqual({ ok: true });
    const row = await getDocument(doc.id);
    expect(row?.retractedAt).toBeInstanceOf(Date);
    const audits = await listAuditEvents("document.retracted", doc.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].actorUserId).toBe(admin.authUser.id);

    // Idempotent: a second retract writes no second audit event.
    const again = await retractDocument({ documentId: doc.id });
    expect(again).toEqual({ ok: true });
    expect(await listAuditEvents("document.retracted", doc.id)).toHaveLength(1);
  });

  it("non-super-admin staff cannot retract", async () => {
    const agent = await createStaff({ email: uniqEmail("agent"), role: "agent" });
    const { doc } = await makeInvestorWithAssetDoc();
    signInAs(agent.authUser);

    const result = await retractDocument({ documentId: doc.id });

    expect(result).toEqual({ ok: false, error: "Forbidden." });
    expect((await getDocument(doc.id))?.retractedAt).toBeNull();
  });

  it("retracted docs disappear from the investor vault listing", async () => {
    const { authUser, doc } = await makeInvestorWithAssetDoc();
    signInAs(authUser);
    expect((await listDocumentsForInvestor()).map((d) => d.id)).toContain(doc.id);

    signInAs(admin.authUser);
    await retractDocument({ documentId: doc.id });

    signInAs(authUser);
    expect((await listDocumentsForInvestor()).map((d) => d.id)).not.toContain(doc.id);
  });

  it("investor download of a retracted doc throws NOT_FOUND (404-no-oracle)", async () => {
    const { authUser, doc } = await makeInvestorWithAssetDoc();
    signInAs(admin.authUser);
    await retractDocument({ documentId: doc.id });

    signInAs(authUser);
    await expect(assertInvestorCanDownload(doc.id)).rejects.toThrow("NOT_FOUND");
  });

  it("staff keep download access to retracted docs for audit", async () => {
    const { doc } = await makeInvestorWithAssetDoc();
    signInAs(admin.authUser);
    await retractDocument({ documentId: doc.id });

    const result = await assertStaffCanDownload(doc.id);
    expect(result.doc.id).toBe(doc.id);
    expect(result.doc.retractedAt).toBeInstanceOf(Date);
  });

  it("admin listing still shows retracted rows with retractedAt (badge data)", async () => {
    const { doc } = await makeInvestorWithAssetDoc();
    signInAs(admin.authUser);
    await retractDocument({ documentId: doc.id });

    const rows = await listDocumentsForAdmin({ role: "super_admin", staffId: admin.profile.id });
    const row = rows.find((r) => r.id === doc.id);
    expect(row).toBeDefined();
    expect(row?.retractedAt).toBeInstanceOf(Date);
  });
});
