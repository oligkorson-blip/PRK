import Link from "next/link";
import { listOwnAccessEvents } from "@/lib/access/queries";
import { ensureInvestor } from "@/lib/auth/investor";
import { formatDateTimeUtc } from "@/lib/format";
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_TYPE_LABEL,
  KYC_STATUS_LABEL
} from "@/lib/portal/labels";
import { DownloadMyDataButton } from "./download-my-data";
import { RevokeOtherSessionsButton } from "./revoke-sessions-button";

export default async function PortalSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ staff2fa?: string }>;
}) {
  // Onboarding gate lives in app/portal/layout.tsx.
  const investor = await ensureInvestor();
  const signIns = await listOwnAccessEvents(10);
  const params = await searchParams;
  const staff2faPrompt = params.staff2fa === "1";

  return (
    <main className="dash-content">
      <section className="section-tight portal-page-head">
        <span className="portal-eyebrow">Your account</span>
        <h1 className="display-m">Profile and security</h1>
        <p className="lead">
          Review your details, protect your sign-in, and manage your personal data.
        </p>
        {staff2faPrompt ? (
          <div className="portal-banner" role="status">
            <p>
              Staff accounts outside demo mode need two-factor authentication before using admin.
              Enroll below, then return to admin.
            </p>
            <Link className="link-arrow" href="/admin">
              Back to admin
            </Link>
          </div>
        ) : null}
      </section>
      <section className="section-tight">
        <dl className="portal-kv">
          <div>
            <dt>Name</dt>
            <dd>{investor.fullName || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{investor.email}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{investor.phone || "—"}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{investor.country || "—"}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>
              {ACCOUNT_TYPE_LABEL[investor.accountType ?? "individual"] ??
                investor.accountType ??
                "individual"}
            </dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>{ACCOUNT_STATUS_LABEL[investor.accountStatus] ?? investor.accountStatus}</dd>
          </div>
          <div>
            <dt>KYC</dt>
            <dd>{KYC_STATUS_LABEL[investor.kycStatus] ?? investor.kycStatus}</dd>
          </div>
        </dl>
        <p className="field-hint stack-4">
          Need a correction? <Link href="/contact">Talk to the team</Link> or your assigned advisor.
        </p>
      </section>
      <section className="section-tight">
        <h2 className="h3">Security</h2>
        <p className="field-hint stack-4">
          Optional: add an authenticator in about a minute, then return here.{" "}
          <Link href="/account/security">Manage two-factor authentication</Link>.
        </p>
        <RevokeOtherSessionsButton />
      </section>
      <section className="section-tight">
        <h2 className="h3">Recent sign-ins</h2>
        {signIns.length === 0 ? (
          <p className="field-hint">No sign-ins recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data data-compact">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col" className="hide-mobile">Device</th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {signIns.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTimeUtc(event.occurredAt)}</td>
                    <td className="hide-mobile">
                      {[event.uaBrowser, event.uaOs].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="cell-nowrap">{event.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint stack-4">
          Don&apos;t recognise a sign-in? <Link href="/contact">Talk to the team</Link> straight away.
        </p>
      </section>
      <section className="section-tight">
        <h2 className="h3">Your data</h2>
        <p className="field-hint stack-4">
          Download a copy of the data we hold about you — profile, applications, interests,
          holdings, KYC document metadata, and sign-in logs — as a JSON file. For erasure, <Link href="/contact">contact the team</Link>.
        </p>
        <DownloadMyDataButton />
      </section>
    </main>
  );
}
