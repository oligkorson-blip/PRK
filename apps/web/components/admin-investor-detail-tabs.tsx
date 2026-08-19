"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminSection } from "@/components/admin/admin-section";
import { StatusPill } from "@/components/admin/status-pill";
import { AdminAssistedKyc } from "@/components/admin-assisted-kyc";
import { AdminInvestorAccessActions } from "@/components/admin-investor-access-actions";
import { PersonAccessPanel } from "@/components/person-access-panel";
import type { AccessEventRow, InvestorDetail } from "@/lib/access/queries";
import type { InvestorActivityItem } from "@/lib/investors/activity";
import { AdminInvestorNoteForm } from "@/components/admin-investor-note-form";
import type {
  InvestorApplicationRow,
  InvestorDistributionRow,
  InvestorHoldingRow,
  InvestorInterestRow,
  InvestorKycDocRow
} from "@/lib/investors/queries";
import { formatEur, formatYieldPct, formatDateDdMmYyyy, formatDateTimeUtc } from "@/lib/format";
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_TYPE_LABEL,
  APPLICATION_STATUS_LABEL,
  HOLDING_STATUS_LABEL,
  INTEREST_STATUS_LABEL,
  KYC_STATUS_LABEL,
  ONBOARDING_STATUS_LABEL
} from "@/lib/portal/labels";
import {
  formatDistributionStatus,
  formatDistributionType
} from "@/lib/portfolio/distribution-labels";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "application", label: "Application" },
  { id: "kyc", label: "KYC" },
  { id: "holdings", label: "Holdings & Payments" },
  { id: "interests", label: "Interests" },
  { id: "activity", label: "Activity" },
  { id: "access", label: "Access" }
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(raw: string | null): TabId {
  const hit = TABS.find((t) => t.id === raw?.toLowerCase());
  return hit?.id ?? "profile";
}

function EmptyBlock({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="empty-state">
      <h3 className="h3">{title}</h3>
      <p className="lead">{lead}</p>
    </div>
  );
}

function TabPanel({ id, children }: { id: TabId; children: React.ReactNode }) {
  return (
    <div
      id={`investor-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`investor-tab-${id}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function AdminInvestorDetailTabs({
  investor,
  application,
  kycDocs,
  interests,
  holdings,
  distributions,
  activity,
  events
}: {
  investor: InvestorDetail;
  application: InvestorApplicationRow | null;
  kycDocs: InvestorKycDocRow[];
  interests: InvestorInterestRow[];
  holdings: InvestorHoldingRow[];
  distributions: InvestorDistributionRow[];
  activity: InvestorActivityItem[];
  events: AccessEventRow[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  const setTab = useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "profile") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="admin-investor-tabs">
      <div className="admin-tablist" role="tablist" aria-label="Investor sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`investor-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`investor-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`admin-tab${tab === item.id ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const currentIndex = TABS.findIndex((candidate) => candidate.id === item.id);
              let nextIndex = currentIndex;
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                nextIndex = (currentIndex + 1) % TABS.length;
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = TABS.length - 1;
              } else {
                return;
              }
              event.preventDefault();
              const next = TABS[nextIndex];
              setTab(next.id);
              requestAnimationFrame(() => {
                document.getElementById(`investor-tab-${next.id}`)?.focus();
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <TabPanel id="profile">
          <AdminSection title="Access & lifecycle">
            <AdminInvestorAccessActions
              investorId={investor.id}
              email={investor.email}
              accountStatus={investor.accountStatus}
              kycStatus={investor.kycStatus}
              applicationStatus={application?.status}
            />
          </AdminSection>
          <AdminSection title="Profile">
            <dl className="lead-facts">
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
                <dd>{investor.country}</dd>
              </div>
              <div>
                <dt>Assigned agent</dt>
                <dd>{investor.assignedAgentEmail ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>
                  <StatusPill
                    status={investor.accountStatus}
                    label={ACCOUNT_STATUS_LABEL[investor.accountStatus] ?? investor.accountStatus}
                  />
                </dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd>
                  <StatusPill
                    status={investor.onboardingStatus}
                    label={
                      ONBOARDING_STATUS_LABEL[investor.onboardingStatus] ??
                      investor.onboardingStatus
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>KYC</dt>
                <dd>
                  <StatusPill
                    status={investor.kycStatus}
                    label={KYC_STATUS_LABEL[investor.kycStatus] ?? investor.kycStatus}
                  />
                </dd>
              </div>
            </dl>
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "application" ? (
        <TabPanel id="application">
          <AdminSection title="Application">
          {!application ? (
            <EmptyBlock title="No application" lead="No application on file." />
          ) : (
            <dl className="lead-facts">
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill
                    status={application.status}
                    label={APPLICATION_STATUS_LABEL[application.status] ?? application.status}
                  />
                </dd>
              </div>
              <div>
                <dt>Account type</dt>
                <dd>
                  {ACCOUNT_TYPE_LABEL[application.accountType] ?? application.accountType}
                </dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>
                  {application.firstName} {application.lastName}
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{application.email}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{application.phone}</dd>
              </div>
              <div>
                <dt>Residence</dt>
                <dd>{application.countryOfResidence}</dd>
              </div>
              {application.companyLegalName ? (
                <div>
                  <dt>Company</dt>
                  <dd>
                    {application.companyLegalName}
                    {application.countryOfIncorporation
                      ? ` (${application.countryOfIncorporation})`
                      : ""}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Ticket band</dt>
                <dd>{String(application.investmentProfile.ticketBand ?? "—")}</dd>
              </div>
              <div>
                <dt>Goals</dt>
                <dd>{String(application.investmentProfile.goalsNote ?? "—")}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTimeUtc(application.createdAt)}</dd>
              </div>
              {application.opsNote ? (
                <div>
                  <dt>Ops note</dt>
                  <dd>{application.opsNote}</dd>
                </div>
              ) : null}
            </dl>
          )}
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "kyc" ? (
        <TabPanel id="kyc">
          <AdminSection title="KYC documents">
            <div className="staff-action-row stack-b-4">
              <span className="field-hint">Status</span>
              <StatusPill
                status={investor.kycStatus}
                label={KYC_STATUS_LABEL[investor.kycStatus] ?? investor.kycStatus}
              />
              {investor.kycStatus === "rejected" && investor.kycRejectReason ? (
                <span className="field-hint">{investor.kycRejectReason}</span>
              ) : null}
            </div>
            {kycDocs.length === 0 ? (
              <EmptyBlock title="No KYC files" lead="No KYC files uploaded yet." />
            ) : (
              <div className="table-wrap">
                <table className="admin-table investor-detail-table">
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Title</th>
                      <th scope="col">Uploaded</th>
                      <th scope="col">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kycDocs.map((doc) => (
                      <tr key={doc.id}>
                        <td data-label="Category">{doc.category}</td>
                        <td className="wrap-anywhere" data-label="Title">
                          {doc.title}
                        </td>
                        <td data-label="Uploaded">{formatDateDdMmYyyy(doc.createdAt)}</td>
                        <td data-label="Download">
                          <Link
                            className="link-arrow"
                            href={`/api/documents/${doc.id}/download`}
                            aria-label={`Open ${doc.title}`}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
          <AdminSection title="Assisted KYC">
            <AdminAssistedKyc investor={investor} />
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "holdings" ? (
        <TabPanel id="holdings">
          <AdminSection title="Holdings">
            {holdings.length === 0 ? (
              <EmptyBlock
                title="No holdings"
                lead="Holdings appear here once an interest is confirmed."
              />
            ) : (
              <div className="table-wrap">
                <table className="admin-table investor-detail-table">
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Target yield</th>
                      <th scope="col">Status</th>
                      <th scope="col">Confirmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Asset">
                          <Link href={`/opportunities/${row.assetSlug}`}>{row.assetName}</Link>
                        </td>
                        <td data-label="Amount">{formatEur(row.amountEur)}</td>
                        <td data-label="Target yield">{formatYieldPct(row.targetYieldPct)}</td>
                        <td data-label="Status">{HOLDING_STATUS_LABEL[row.status] ?? row.status}</td>
                        <td data-label="Confirmed">{formatDateDdMmYyyy(row.confirmedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
          <AdminSection title="Payments">
            {distributions.length === 0 ? (
              <EmptyBlock
                title="No payments"
                lead="Payments appear here once a distribution is recorded for a holding."
              />
            ) : (
              <div className="table-wrap">
                <table className="admin-table investor-detail-table">
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Type</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Period">{row.periodLabel ?? "—"}</td>
                        <td data-label="Type">{formatDistributionType(row.type)}</td>
                        <td data-label="Amount">{formatEur(row.amountEur)}</td>
                        <td data-label="Status">{formatDistributionStatus(row.status)}</td>
                        <td data-label="Date">
                          {formatDateDdMmYyyy(row.paidAt ?? row.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "interests" ? (
        <TabPanel id="interests">
          <AdminSection title="Interests">
          {interests.length === 0 ? (
            <EmptyBlock title="No interests" lead="No interests yet." />
          ) : (
            <div className="table-wrap">
              <table className="admin-table investor-detail-table">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {interests.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Asset">
                        <Link href={`/opportunities/${row.assetSlug}`}>{row.assetName}</Link>
                      </td>
                      <td data-label="Amount">{formatEur(Number(row.amountEur))}</td>
                      <td data-label="Status">{INTEREST_STATUS_LABEL[row.status] ?? row.status}</td>
                      <td data-label="Date">{formatDateDdMmYyyy(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "activity" ? (
        <TabPanel id="activity">
          <AdminSection title="Activity">
          <AdminInvestorNoteForm investorId={investor.id} />
          {activity.length === 0 ? (
            <div className="empty-state stack-6">
              <h3 className="h3">No activity</h3>
              <p className="lead">No activity yet.</p>
            </div>
          ) : (
            <ul className="admin-activity-list stack-6">
              {activity.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="admin-activity-item">
                  <p>
                    <strong>{item.line}</strong>
                    {item.authorEmail ? ` — ${item.authorEmail}` : ""}
                  </p>
                  {item.body ? <p>{item.body}</p> : null}
                  <p className="field-hint">{formatDateTimeUtc(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          </AdminSection>
        </TabPanel>
      ) : null}

      {tab === "access" ? (
        <TabPanel id="access">
          <PersonAccessPanel events={events} />
        </TabPanel>
      ) : null}
    </div>
  );
}
