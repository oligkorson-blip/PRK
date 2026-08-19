import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { PersonAccessPanel } from "@/components/person-access-panel";
import {
  listAccessEventsForAuthUser,
  type AccessEventRow
} from "@/lib/access/queries";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
import { getStaffContext } from "@/lib/auth/staff";
import { isActiveStaff, isSuperAdminEmail } from "@/lib/auth/roles";
import { formatDateDdMmYyyy, isUuid } from "@/lib/format";
import { ResetTwoFactorButton } from "@/app/admin/staff/[staffId]/reset-two-factor-button";
import { DemoteStaffButton } from "@/app/admin/staff/demote-staff-button";
import {
  getStaffDetailForSuperAdmin,
  listStaff,
  type StaffDetail
} from "@/lib/staff/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ staffId: string }> };

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

export default async function AdminStaffDetailPage({ params }: Params) {
  const staff = await getStaffContext();
  if (!staff || staff.role !== "super_admin") redirect("/");

  const { staffId } = await params;
  if (!isUuid(staffId)) notFound();

  let profile: StaffDetail;
  let events: AccessEventRow[] = [];
  let twoFactorEnabled = false;
  let demoteControl: React.ReactNode = null;
  try {
    profile = await getStaffDetailForSuperAdmin(staffId);
    [events, twoFactorEnabled] = await Promise.all([
      listAccessEventsForAuthUser(profile.authUserId),
      isTwoFactorEnabledForUser(profile.authUserId)
    ]);

    // Demote/deactivate controls mirror the staff list page; needs the full
    // roster to offer lead/team reassignment targets.
    if (!profile.deactivatedAt && profile.id !== staff.staff.id) {
      const isStaleSuperAdmin =
        profile.role === "super_admin" && !isSuperAdminEmail(profile.email);
      if (profile.role === "agent" || profile.role === "ib" || isStaleSuperAdmin) {
        const roster = await listStaff();
        const activeIbs = roster
          .filter((row) => row.role === "ib" && isActiveStaff(row))
          .map((row) => ({ id: row.id, email: row.email }));
        if (profile.role === "ib") {
          demoteControl = (
            <DemoteStaffButton
              staffId={profile.id}
              email={profile.email}
              role="ib"
              ibs={activeIbs.filter((ib) => ib.id !== profile.id)}
            />
          );
        } else {
          const teammates = roster
            .filter(
              (row) =>
                row.role === "agent" &&
                isActiveStaff(row) &&
                row.ibId === profile.ibId &&
                row.id !== profile.id
            )
            .map((row) => ({ id: row.id, email: row.email }));
          demoteControl = (
            <DemoteStaffButton
              staffId={profile.id}
              email={profile.email}
              role="agent"
              teammates={teammates}
              ibs={activeIbs.filter((ib) => ib.id !== profile.ibId)}
            />
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={profile.email}
        subtitle="Staff profile and sign-in access history."
        actions={
          <Link className="link-arrow" href="/admin/staff">
            Back to staff
          </Link>
        }
      />

      <AdminSection title="Profile">
        <div className="table-wrap">
          <table className="admin-table admin-table-kv">
          <tbody>
            <tr>
              <th scope="row">Email</th>
              <td>{profile.email}</td>
            </tr>
            <tr>
              <th scope="row">Role</th>
              <td>
                <span
                  className={`stage-pill ${STAFF_ROLE_PILL[profile.role] ?? "stage-pill-muted"}`}
                >
                  {STAFF_ROLE_LABEL[profile.role] ?? profile.role}
                </span>
                {profile.deactivatedAt ? (
                  <span className="stage-pill stage-pill-muted">Deactivated</span>
                ) : null}
              </td>
            </tr>
            <tr>
              <th scope="row">Parent IB</th>
              <td>{profile.role === "agent" ? (profile.ibEmail ?? "—") : "—"}</td>
            </tr>
            <tr>
              <th scope="row">Staff since</th>
              <td>{formatDateDdMmYyyy(profile.createdAt)}</td>
            </tr>
            <tr>
              <th scope="row">Two-factor</th>
              <td>{twoFactorEnabled ? "Enrolled" : "Not enrolled"}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </AdminSection>

      {twoFactorEnabled ? (
        <AdminSection title="Two-factor authentication">
          <ResetTwoFactorButton staffId={staffId} email={profile.email} />
        </AdminSection>
      ) : null}

      {demoteControl ? (
        <AdminSection title="Remove staff access">{demoteControl}</AdminSection>
      ) : null}

      <PersonAccessPanel events={events} />
    </div>
  );
}
