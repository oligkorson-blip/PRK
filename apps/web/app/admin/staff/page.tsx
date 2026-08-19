import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth/staff";
import { isActiveStaff, isSuperAdminEmail } from "@/lib/auth/roles";
import { listStaff, type StaffRow } from "@/lib/staff/queries";
import { DemoteStaffButton } from "./demote-staff-button";
import { PromoteAgentForm } from "./promote-agent-form";
import { PromoteIbForm } from "./promote-ib-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";

export const dynamic = "force-dynamic";

const STAFF_ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  ib: "IB",
  agent: "Agent"
};

const STAFF_ROLE_PILL: Record<string, string> = {
  super_admin: "stage-pill-converted",
  ib: "stage-pill-clear",
  agent: "stage-pill-new"
};

export default async function AdminStaffPage() {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "super_admin") redirect("/");

  let rows: StaffRow[];
  try {
    rows = await listStaff();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  // Deactivated staff can never log in — never offer them as assignment targets.
  const ibs = rows
    .filter((row) => row.role === "ib" && isActiveStaff(row))
    .map((row) => ({ id: row.id, email: row.email }));
  const agents = rows.filter((row) => row.role === "agent" && isActiveStaff(row));

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Staff"
        subtitle="Promote signed-up users to IBs and agents. Every agent belongs to one IB. Super admins are managed via environment configuration."
      />

      <AdminSection title="Current staff">
        {rows.length === 0 ? (
          <p className="lead">No staff profiles yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table staff-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Parent IB</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-email" title={row.email} data-label="Email">
                    <Link href={`/admin/staff/${row.id}`}>{row.email}</Link>
                  </td>
                  <td data-label="Role">
                    <span
                      className={`stage-pill ${STAFF_ROLE_PILL[row.role] ?? "stage-pill-muted"}`}
                    >
                      {STAFF_ROLE_LABEL[row.role] ?? row.role}
                    </span>
                    {row.deactivatedAt ? (
                      <span className="stage-pill stage-pill-muted">Deactivated</span>
                    ) : null}
                  </td>
                  <td data-label="Parent IB">{row.role === "agent" ? (row.ibEmail ?? "—") : "—"}</td>
                  <td data-label="Actions">
                    {row.deactivatedAt ? (
                      "—"
                    ) : row.role === "agent" && row.id !== staff.staff.id ? (
                      <DemoteStaffButton
                        staffId={row.id}
                        email={row.email}
                        role="agent"
                        teammates={agents
                          .filter((a) => a.ibId === row.ibId && a.id !== row.id)
                          .map((a) => ({ id: a.id, email: a.email }))}
                        ibs={ibs.filter((ib) => ib.id !== row.ibId)}
                      />
                    ) : row.role === "ib" && row.id !== staff.staff.id ? (
                      <DemoteStaffButton
                        staffId={row.id}
                        email={row.email}
                        role="ib"
                        ibs={ibs.filter((ib) => ib.id !== row.id)}
                      />
                    ) : row.role === "super_admin" &&
                      !isSuperAdminEmail(row.email) &&
                      row.id !== staff.staff.id ? (
                      // Stale super_admin row (email left SUPER_ADMIN_EMAILS):
                      // no longer privileged, so it can be deactivated here.
                      <DemoteStaffButton
                        staffId={row.id}
                        email={row.email}
                        role="agent"
                        teammates={[]}
                        ibs={[]}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </AdminSection>

      <AdminSection title="Add staff">
        <div className="grid-2">
          <div>
            <h3 className="h3">Promote IB</h3>
            <PromoteIbForm />
          </div>
          <div>
            <h3 className="h3">Promote agent</h3>
            <PromoteAgentForm ibs={ibs} />
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
