/**
 * Integration tests for lib/apply/admin-actions.ts — approveAndInvite (incl.
 * the orphan-adoption recovery path), regenerate, contacted, and reject —
 * against a real Postgres scratch database. Only the session is mocked;
 * SMTP_HOST is cleared by the harness so invite emails skip instead of send.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { postgresErrorCode } from "@/lib/db/errors";

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

import { and, eq, isNull } from "drizzle-orm";
import {
  approveAndInvite,
  markApplicationContacted,
  rejectApplication
} from "@/lib/apply/admin-actions";
import {
  describeIntegration,
  setupIntegrationDatabase,
  type IntegrationDbHandle
} from "./helpers/db";
import {
  account,
  createApplication,
  createAuthUser,
  createInvestor,
  createStaff,
  db,
  getInvestor,
  investorApplications,
  investors,
  inviteTokens,
  listAuditEvents,
  listInviteTokensForInvestor,
  uniqEmail,
  user
} from "./helpers/fixtures";

function signInAs(u: { id: string; email: string } | null) {
  sessionState.user = u;
}

type Staff = Awaited<ReturnType<typeof createStaff>>;

describeIntegration("apply admin actions (integration)", () => {
  let handle: IntegrationDbHandle;
  let admin: Staff;

  async function makeIb() {
    return createStaff({ email: uniqEmail("ib"), role: "ib" });
  }
  async function makeAgent(ib: Staff) {
    return createStaff({ email: uniqEmail("agent"), role: "agent", ibId: ib.profile.id });
  }

  /** An applicant: investor row without an auth user, with a submitted application. */
  async function makeApplicant(overrides?: {
    ibId?: string | null;
    assignedAgentId?: string | null;
    accountStatus?: "pending_access" | "active" | "suspended";
    applicationStatus?: "submitted" | "contacted" | "approved" | "rejected";
  }) {
    const email = uniqEmail("applicant");
    const { investor } = await createInvestor({
      email,
      withAuthUser: false,
      accountStatus: overrides?.accountStatus ?? "pending_access",
      ibId: overrides?.ibId ?? null,
      assignedAgentId: overrides?.assignedAgentId ?? null
    });
    const application = await createApplication(investor.id, {
      email,
      status: overrides?.applicationStatus ?? "submitted"
    });
    return { investor, application, email };
  }

  beforeAll(async () => {
    handle = await setupIntegrationDatabase();
    const adminEmail = uniqEmail("sa");
    process.env.SUPER_ADMIN_EMAILS = adminEmail;
    admin = await createStaff({ email: adminEmail, role: "super_admin" });
  }, 120_000);

  afterAll(async () => {
    await handle?.teardown();
  });

  beforeEach(() => {
    signInAs(admin.authUser);
  });

  describe("approveAndInvite", () => {
    it("creates the auth user, approves the application, and issues one live invite", async () => {
      const { investor, application, email } = await makeApplicant();

      const result = await approveAndInvite(investor.id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.inviteUrl).toContain("/set-password?token=");
      expect(result.emailSent).toBe(false); // SMTP_HOST cleared by the harness

      const approved = await getInvestor(investor.id);
      expect(approved?.accountStatus).toBe("active");
      expect(approved?.authUserId).toBeTruthy();

      const [authUser] = await db.select().from(user).where(eq(user.id, approved!.authUserId!));
      expect(authUser.email).toBe(email);
      const [cred] = await db
        .select()
        .from(account)
        .where(and(eq(account.userId, authUser.id), eq(account.providerId, "credential")));
      expect(cred).toBeTruthy();

      const [appRow] = await db
        .select()
        .from(investorApplications)
        .where(eq(investorApplications.id, application.id));
      expect(appRow.status).toBe("approved");

      const tokens = await listInviteTokensForInvestor(investor.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].usedAt).toBeNull();
      expect(tokens[0].createdBy).toBe(admin.authUser.id);

      const audit = await listAuditEvents("investor.invited", investor.id);
      expect(audit).toHaveLength(1);
    });

    it("a second approve regenerates the invite and invalidates the old token", async () => {
      const { investor } = await makeApplicant();
      const first = await approveAndInvite(investor.id);
      expect(first.ok).toBe(true);

      const second = await approveAndInvite(investor.id);

      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.inviteUrl).not.toBe(first.inviteUrl);

      const tokens = await listInviteTokensForInvestor(investor.id);
      expect(tokens).toHaveLength(2);
      const live = tokens.filter((t) => t.usedAt === null);
      expect(live).toHaveLength(1);

      // Direct check of the partial "live token" query the app itself uses.
      const liveRows = await db
        .select({ id: inviteTokens.id })
        .from(inviteTokens)
        .where(and(eq(inviteTokens.investorId, investor.id), isNull(inviteTokens.usedAt)));
      expect(liveRows).toHaveLength(1);
      expect(liveRows[0].id).toBe(live[0].id);
    });

    it("adopts an unlinked orphan auth user left by an earlier partial failure", async () => {
      const email = uniqEmail("orphan");
      const orphan = await createAuthUser(email); // no investor references it
      const { investor } = await makeApplicant();
      // Point the applicant at the orphan's email.
      await db.update(investors).set({ email }).where(eq(investors.id, investor.id));
      await db
        .update(investorApplications)
        .set({ email })
        .where(eq(investorApplications.investorId, investor.id));

      const result = await approveAndInvite(investor.id);

      // The user insert hit the real user.email unique index (23505); the
      // recovery path adopted the orphan instead of failing.
      expect(result).toMatchObject({ ok: true });
      const linked = await getInvestor(investor.id);
      expect(linked?.authUserId).toBe(orphan.id);
      expect(linked?.accountStatus).toBe("active");
    });

    it("scopes access: only staff whose book contains the investor may approve", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const otherIb = await makeIb();
      const otherAgent = await makeAgent(otherIb);

      const inBook = await makeApplicant({
        ibId: ib.profile.id,
        assignedAgentId: agent.profile.id
      });
      signInAs(agent.authUser);
      expect((await approveAndInvite(inBook.investor.id)).ok).toBe(true);

      const outOfBook = await makeApplicant({ ibId: otherIb.profile.id });
      signInAs(agent.authUser);
      expect(await approveAndInvite(outOfBook.investor.id)).toEqual({
        ok: false,
        error: "You do not have access to this investor."
      });

      signInAs(otherIb.authUser);
      expect((await approveAndInvite(outOfBook.investor.id)).ok).toBe(true);

      const unassigned = await makeApplicant();
      signInAs(agent.authUser);
      expect(await approveAndInvite(unassigned.investor.id)).toEqual({
        ok: false,
        error: "You do not have access to this investor."
      });
      signInAs(admin.authUser);
      expect((await approveAndInvite(unassigned.investor.id)).ok).toBe(true);
    });

    it("rejects suspended investors, rejected applications, and missing applications", async () => {
      const suspended = await makeApplicant({ accountStatus: "suspended" });
      expect(await approveAndInvite(suspended.investor.id)).toEqual({
        ok: false,
        error: "Investor is suspended."
      });

      const rejected = await makeApplicant({ applicationStatus: "rejected" });
      expect(await approveAndInvite(rejected.investor.id)).toEqual({
        ok: false,
        error: "Application is already rejected."
      });

      const noApp = await createInvestor({ email: uniqEmail("noapp"), withAuthUser: false });
      expect(await approveAndInvite(noApp.investor.id)).toEqual({
        ok: false,
        error: "No application found."
      });
    });

    it("rejects non-staff callers", async () => {
      const plain = await createAuthUser(uniqEmail("plain"));
      const { investor } = await makeApplicant();
      signInAs(plain);
      expect(await approveAndInvite(investor.id)).toEqual({ ok: false, error: "Forbidden." });
    });
  });

  describe("markApplicationContacted / rejectApplication", () => {
    it("moves a submitted application to contacted with an audit row", async () => {
      const { investor, application } = await makeApplicant();

      expect(await markApplicationContacted(investor.id)).toEqual({ ok: true });

      const [appRow] = await db
        .select()
        .from(investorApplications)
        .where(eq(investorApplications.id, application.id));
      expect(appRow.status).toBe("contacted");
      const audit = await listAuditEvents("application.contacted", investor.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ applicationId: application.id });
    });

    it("rejects with a validated ops note and audits it", async () => {
      const { investor, application } = await makeApplicant();

      expect(await rejectApplication(investor.id, "Incomplete documentation provided.")).toEqual({
        ok: true
      });

      const [appRow] = await db
        .select()
        .from(investorApplications)
        .where(eq(investorApplications.id, application.id));
      expect(appRow.status).toBe("rejected");
      expect(appRow.opsNote).toBe("Incomplete documentation provided.");
      const audit = await listAuditEvents("application.rejected", investor.id);
      expect(audit).toHaveLength(1);
      expect(audit[0].payload).toMatchObject({ applicationId: application.id });
    });

    it("requires a reject note and scopes access to the owning book", async () => {
      const ib = await makeIb();
      const agent = await makeAgent(ib);
      const { investor } = await makeApplicant();

      expect(await rejectApplication(investor.id, "short")).toEqual({
        ok: false,
        error: "Rejection note required (at least 8 characters)."
      });

      signInAs(agent.authUser); // out-of-book: applicant is unassigned
      expect(await rejectApplication(investor.id, "Not a fit for this round.")).toEqual({
        ok: false,
        error: "You do not have access to this investor."
      });
    });
  });

  describe("investors table constraints (real SQL)", () => {
    it("enforces investors_email_lower_uidx case-insensitively", async () => {
      const email = uniqEmail("dup");
      await createInvestor({ email, withAuthUser: false });

      await expect(
        db.insert(investors).values({ email: email.toUpperCase(), fullName: "Dup" })
      ).rejects.toSatisfy((e) => postgresErrorCode(e) === "23505");
    });
  });
});
