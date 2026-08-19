import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { listAmlChecklistForStaff } from "@/lib/aml/queries";
import { amlChecklistState, triageAmlChecklist, type AmlChecklistState } from "@/lib/aml/state";
import { requireStaff } from "@/lib/auth/staff";
import { KYC_STATUS_LABEL } from "@/lib/portal/labels";
import { AML_CONFIRM_MINIMUM } from "@/lib/copy/posture";
import { formatDateDdMmYyyy } from "@/lib/format";
import { RecordScreeningForm } from "./record-screening-form";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<AmlChecklistState, string> = {
  clear: "Screened clear",
  flagged: "Flagged — review",
  blocking: "Blocking — screening required",
  awaiting_screening: "Awaiting screening"
};

const STATE_PILL_CLASS: Record<AmlChecklistState, string> = {
  clear: "stage-pill-clear",
  flagged: "stage-pill-flagged",
  blocking: "stage-pill-blocking",
  awaiting_screening: "stage-pill-awaiting"
};

const KYC_PILL_CLASS: Record<string, string> = {
  approved: "stage-pill-clear",
  submitted: "stage-pill-awaiting",
  under_review: "stage-pill-awaiting",
  rejected: "stage-pill-blocking",
  not_started: "stage-pill-muted"
};

const STATE_FILTER_PILLS: { value: AmlChecklistState | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "blocking", label: "Blocking" },
  { value: "awaiting_screening", label: "Awaiting" },
  { value: "flagged", label: "Flagged" },
  { value: "clear", label: "Clear" }
];

function formatReviewedAt(date: Date): string {
  return formatDateDdMmYyyy(date);
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminAmlChecklistPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  try {
    await requireStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/");
    }
    throw error;
  }

  const raw = await searchParams;
  const stateParam = Array.isArray(raw.state) ? raw.state[0] : raw.state;
  const filter: AmlChecklistState | null =
    stateParam && stateParam in STATE_LABEL ? (stateParam as AmlChecklistState) : null;

  const rows = await listAmlChecklistForStaff();
  const withState = rows.map((row) => ({
    row,
    state: amlChecklistState({
      kycStatus: row.kycStatus,
      latestResult: row.latestCheck?.result ?? null
    })
  }));
  const blockingCount = withState.filter((entry) => entry.state === "blocking").length;
  // Default order: most urgent states first (blocking → awaiting → flagged → clear).
  const visible = triageAmlChecklist(withState, (entry) => entry.state, filter);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Identity and AML checks"
        subtitle="Record the required screening before an investment request can be confirmed."
      />
      <ol className="aml-checklist stack-b-4">
        {AML_CONFIRM_MINIMUM.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      <h2 className="display-s stack-6">Investor screening</h2>
      {blockingCount > 0 ? (
        <p className="field-hint stack-b-4">
          <Link href="?state=blocking">
            {blockingCount} investor{blockingCount === 1 ? "" : "s"} with approved KYC but no
            screening on record — confirmation is blocked until a clear screening is recorded.
          </Link>
        </p>
      ) : null}

      <nav className="admin-tablist" aria-label="Screening state">
        {STATE_FILTER_PILLS.map((pill) => {
          const active = filter === (pill.value || null);
          return (
            <Link
              key={pill.value || "all"}
              className={`admin-tab${active ? " is-active" : ""}`}
              href={pill.value ? `?state=${pill.value}` : "/admin/aml-checklist"}
              aria-current={active ? "page" : undefined}
            >
              {pill.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="lead">No investors to show.</p>
      ) : visible.length === 0 ? (
        <p className="lead">No investors in this state.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table aml-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Name</th>
              <th scope="col">KYC</th>
              <th scope="col">PEP declared</th>
              <th scope="col">Latest screening</th>
              <th scope="col">State</th>
              <th scope="col">Record</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, state }) => {
              return (
                <tr key={row.id}>
                  <td className="cell-email" title={row.email} data-label="Email">
                    <Link href={`/admin/investors/${row.id}`}>{row.email}</Link>
                  </td>
                  <td data-label="Name">
                    {row.fullName ? (
                      <Link href={`/admin/investors/${row.id}`}>{row.fullName}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="KYC">
                    <span
                      className={`stage-pill ${KYC_PILL_CLASS[row.kycStatus] ?? "stage-pill-muted"}`}
                    >
                      {KYC_STATUS_LABEL[row.kycStatus] ?? row.kycStatus}
                    </span>
                  </td>
                  <td data-label="PEP declared">
                    {row.pepDeclaration === null ? "—" : row.pepDeclaration ? "Yes" : "No"}
                  </td>
                  <td data-label="Latest screening">
                    {row.latestCheck ? (
                      <>
                        {row.latestCheck.result} · {formatReviewedAt(row.latestCheck.reviewedAt)}
                        <br />
                        <span className="field-hint">{row.latestCheck.screeningNote}</span>
                        {row.latestCheck.sourceOfFundsNote ? (
                          <>
                            <br />
                            <span className="field-hint">
                              SoF: {row.latestCheck.sourceOfFundsNote}
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="State">
                    <span className={`stage-pill ${STATE_PILL_CLASS[state]}`}>
                      {STATE_LABEL[state]}
                    </span>
                  </td>
                  <td data-label="Record">
                    <details>
                      <summary className="link-arrow">Record</summary>
                      <RecordScreeningForm investorId={row.id} />
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

    </div>
  );
}
