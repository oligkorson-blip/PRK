import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { requireAdmin } from "@/lib/auth/investor";
import {
  isCommunitySpacesEnabled,
  getPoolInvestmentsSetting
} from "@/lib/platform-settings/queries";
import {
  setCommunitySpacesEnabled,
  setPoolInvestmentsEnabled
} from "@/lib/platform-settings/actions";

export default async function PlatformSettingsPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/");
    }
    throw error;
  }

  if (admin.role !== "super_admin") {
    redirect("/");
  }

  const [setting, communitySpacesEnabled] = await Promise.all([
    getPoolInvestmentsSetting(),
    isCommunitySpacesEnabled()
  ]);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Platform settings"
        subtitle="Control which product lanes can accept new activity. Existing holdings are never changed by these switches."
      />

      <section className="admin-settings-grid" aria-label="Product settings">
        <article className="admin-settings-card">
          <div className="admin-settings-card-head">
            <div>
              <p className="admin-section-kicker">Investor product</p>
              <h2 className="h3">Location-pool investments</h2>
            </div>
            <span className={setting.enabled ? "badge badge-status-confirmed" : "badge badge-status-closed"}>
              {setting.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p>
            When enabled, converted users who have completed onboarding can submit a non-binding
            interest in a published opportunity. When disabled, browsing remains available but new
            pool requests are blocked.
          </p>
          <p className="field-hint">
            This switch does not close existing investments, remove holdings, or change recorded
            payments.
          </p>
          <form action={setPoolInvestmentsEnabled} className="admin-settings-form">
            <button
              className={setting.enabled ? "btn btn-ghost" : "btn btn-primary"}
              type="submit"
              name="enabled"
              value={setting.enabled ? "false" : "true"}
            >
              {setting.enabled ? "Disable pool requests" : "Enable pool requests"}
            </button>
          </form>
        </article>

        <article className="admin-settings-card">
          <div className="admin-settings-card-head">
            <div>
              <p className="admin-section-kicker">New-user product</p>
              <h2 className="h3">Community parking spaces</h2>
            </div>
            <span className={communitySpacesEnabled ? "badge badge-status-confirmed" : "badge badge-status-closed"}>
              {communitySpacesEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p>
            Show verified residential spaces, EV charging bays, garages, and private lots supplied
            by local hosts. Listings are manually reviewed before publication.
          </p>
          <p className="field-hint">
            This lane is separate from investments. Turning it off hides the public catalogue but
            does not delete listings or host records.
          </p>
          <form action={setCommunitySpacesEnabled} className="admin-settings-form">
            <button
              className={communitySpacesEnabled ? "btn btn-ghost" : "btn btn-primary"}
              type="submit"
              name="enabled"
              value={communitySpacesEnabled ? "false" : "true"}
            >
              {communitySpacesEnabled ? "Disable community spaces" : "Enable community spaces"}
            </button>
          </form>
        </article>
      </section>

      <section className="stack-6" aria-label="Go-live readiness">
        <h2 className="h3">Go-live readiness</h2>
        <p>
          Before flipping <code>DEMO_MODE=false</code>, complete the production checklist and run
          the automated go-live gate. Seed catalogue assets must be replaced with real
          opportunities.
        </p>
        <ul className="admin-goto-list">
          <li>
            Checklist: <code>apps/web/docs/PRODUCTION_CHECKLIST.md</code>
          </li>
          <li>
            Gate: <code>npm run check:go-live</code> from <code>apps/web</code>
          </li>
          <li>
            Staff outside demo must enroll two-factor authentication before using admin.
          </li>
        </ul>
      </section>
    </div>
  );
}
