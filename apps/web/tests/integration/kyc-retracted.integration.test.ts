/**
 * Integration tests for KYC handling of retracted documents: the submit
 * category gate and both 10-file upload caps (investor + assisted) must
 * treat retracted rows as gone, matching the portal listing and download
 * paths. Runs against a real Postgres scratch database — only the session
 * is mocked. Storage writes go to a temp DOCUMENTS_DIR (demo mode allows
 * plaintext).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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

import { assistedKycUpload } from "@/lib/kyc/assisted-actions";
import { submitKycForReview, uploadKycDocument } from "@/lib/kyc/actions";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  createDocument,
  createInvestor,
  createStaff,
  db,
  documents,
  getInvestor,
  uniqEmail
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

function uploadForm(category = "kyc_id"): FormData {
  const data = new FormData();
  data.set("category", category);
  data.set(
    "file",
    new File(["%PDF-1.4 integration"], "passport.pdf", { type: "application/pdf" })
  );
  return data;
}

describeIntegration("KYC retracted documents (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Awaited<ReturnType<typeof createStaff>>;
  let documentsDir: string;
  let previousDocumentsDir: string | undefined;
  let previousDemoMode: string | undefined;

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
    previousDocumentsDir = process.env.DOCUMENTS_DIR;
    previousDemoMode = process.env.DEMO_MODE;
    documentsDir = await mkdtemp(path.join(tmpdir(), "parkwise-kyc-it-"));
    process.env.DOCUMENTS_DIR = documentsDir;
    // putObject refuses plaintext unless demo is explicit (CI leaves DEMO_MODE unset).
    process.env.DEMO_MODE = "true";
  }, 120_000);

  afterAll(async () => {
    if (previousDocumentsDir === undefined) {
      delete process.env.DOCUMENTS_DIR;
    } else {
      process.env.DOCUMENTS_DIR = previousDocumentsDir;
    }
    if (previousDemoMode === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = previousDemoMode;
    }
    await rm(documentsDir, { recursive: true, force: true });
    await handle?.teardown();
  });

  /** Investor-owned doc, retracted on request. */
  async function makeDoc(
    investorId: string,
    uploadedBy: string,
    category: string,
    retracted: boolean
  ) {
    const doc = await createDocument({
      ownerType: "investor",
      ownerId: investorId,
      category,
      uploadedBy
    });
    if (retracted) {
      await db.update(documents).set({ retractedAt: new Date() }).where(eq(documents.id, doc.id));
    }
    return doc;
  }

  it("retracted documents do not satisfy the submit category gate", async () => {
    const { investor, authUser } = await createInvestor({
      email: uniqEmail("inv"),
      kycStatus: "not_started"
    });
    await makeDoc(investor.id, authUser!.id, "kyc_id", true);
    await makeDoc(investor.id, authUser!.id, "kyc_address", true);
    signInAs(authUser);

    const blocked = await submitKycForReview();
    expect(blocked).toEqual({
      ok: false,
      error: "Upload ID and address proof before submitting."
    });
    expect((await getInvestor(investor.id))?.kycStatus).toBe("not_started");

    // Live replacements for the same categories unblock the submission.
    await makeDoc(investor.id, authUser!.id, "kyc_id", false);
    await makeDoc(investor.id, authUser!.id, "kyc_address", false);

    const submitted = await submitKycForReview();
    expect(submitted).toEqual({ ok: true });
    expect((await getInvestor(investor.id))?.kycStatus).toBe("submitted");
  });

  it("retracted files do not count toward the investor 10-file cap", async () => {
    const { investor, authUser } = await createInvestor({
      email: uniqEmail("inv"),
      kycStatus: "rejected"
    });
    for (let i = 0; i < 10; i += 1) {
      await makeDoc(investor.id, authUser!.id, "kyc_id", true);
    }
    signInAs(authUser);

    const result = await uploadKycDocument(uploadForm());

    expect(result.ok).toBe(true);
  });

  it("live files still count toward the investor 10-file cap", async () => {
    const { investor, authUser } = await createInvestor({
      email: uniqEmail("inv"),
      kycStatus: "rejected"
    });
    for (let i = 0; i < 10; i += 1) {
      await makeDoc(investor.id, authUser!.id, "kyc_id", false);
    }
    signInAs(authUser);

    const result = await uploadKycDocument(uploadForm());

    expect(result).toEqual({ ok: false, error: "You can upload up to 10 files." });
  });

  it("retracted files do not count toward the assisted-upload cap", async () => {
    const { investor, authUser } = await createInvestor({
      email: uniqEmail("inv"),
      kycStatus: "rejected"
    });
    for (let i = 0; i < 10; i += 1) {
      await makeDoc(investor.id, authUser!.id, "kyc_id", true);
    }
    signInAs(admin.authUser);

    const result = await assistedKycUpload(investor.id, uploadForm());

    expect(result.ok).toBe(true);
  });
});
