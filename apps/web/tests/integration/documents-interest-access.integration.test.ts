/**
 * Integration tests for interest-status document access — a declined or
 * withdrawn interest must end asset-document access (vault listing and the
 * download gate), while pending/confirmed keep it. Closed holdings keep
 * access via the holdings path regardless of interest status. Real Postgres
 * scratch database; only the session is mocked.
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

import {
  assertInvestorCanDownload,
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
  createHolding,
  createInterestRow,
  createInvestor,
  createStaff,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

describeIntegration("interest-status document access (integration)", () => {
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

  /** Investor with an interest of the given status on an asset, plus an asset doc. */
  async function makeInvestorWithInterest(status: "pending" | "confirmed" | "declined" | "withdrawn") {
    const { investor, authUser } = await createInvestor({ email: uniqEmail("inv") });
    const asset = await createAsset();
    await createInterestRow({ investorId: investor.id, assetId: asset.id, status });
    const doc = await createDocument({
      ownerType: "asset",
      ownerId: asset.id,
      uploadedBy: admin.authUser.id
    });
    return { investor, authUser, asset, doc };
  }

  it.each(["pending", "confirmed"] as const)(
    "%s interest keeps listing and download access",
    async (status) => {
      const { authUser, doc } = await makeInvestorWithInterest(status);
      signInAs(authUser);

      expect((await listDocumentsForInvestor()).map((d) => d.id)).toContain(doc.id);
      const result = await assertInvestorCanDownload(doc.id);
      expect(result.doc.id).toBe(doc.id);
    }
  );

  it.each(["declined", "withdrawn"] as const)(
    "%s interest loses listing and download access",
    async (status) => {
      const { authUser, doc } = await makeInvestorWithInterest(status);
      signInAs(authUser);

      expect((await listDocumentsForInvestor()).map((d) => d.id)).not.toContain(doc.id);
      await expect(assertInvestorCanDownload(doc.id)).rejects.toThrow("FORBIDDEN");
    }
  );

  it("closed holding keeps document access even when the interest is withdrawn", async () => {
    const { investor, authUser } = await createInvestor({ email: uniqEmail("inv") });
    const asset = await createAsset();
    const interest = await createInterestRow({
      investorId: investor.id,
      assetId: asset.id,
      status: "withdrawn"
    });
    await createHolding({
      investorId: investor.id,
      assetId: asset.id,
      interestId: interest.id,
      status: "closed"
    });
    const doc = await createDocument({
      ownerType: "asset",
      ownerId: asset.id,
      uploadedBy: admin.authUser.id
    });
    signInAs(authUser);

    expect((await listDocumentsForInvestor()).map((d) => d.id)).toContain(doc.id);
    const result = await assertInvestorCanDownload(doc.id);
    expect(result.doc.id).toBe(doc.id);
  });
});
