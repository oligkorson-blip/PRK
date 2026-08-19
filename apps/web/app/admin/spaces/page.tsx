import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CommunitySpaceForm } from "@/components/admin/community-space-form";
import { requireAdmin } from "@/lib/auth/investor";
import { listCommunitySpacesForAdmin } from "@/lib/community-spaces/queries";
import { communitySpaceTypeLabel } from "@/lib/community-spaces/types";

export const dynamic = "force-dynamic";

export default async function CommunitySpacesAdminPage() {
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

  const listings = await listCommunitySpacesForAdmin();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Community spaces"
        subtitle="Review host enquiries, then manually curate verified residential spaces, EV bays, garages, and private lots for the public catalogue."
      />
      <p className="field-hint">
        New owner submissions arrive in the{" "}
        <Link className="link-arrow" href="/admin/leads">Community space hosts lead queue</Link>.
      </p>

      <div className="admin-space-layout">
        <section className="admin-settings-card">
          <p className="admin-section-kicker">Manual onboarding</p>
          <h2 className="h3">Add a verified space</h2>
          <p className="field-hint">
            Start with a general district or area. Exact residential addresses stay private until a
            booking workflow is approved.
          </p>
          <CommunitySpaceForm />
        </section>

        <section className="admin-settings-card">
          <div className="admin-settings-card-head">
            <div>
              <p className="admin-section-kicker">Catalogue</p>
              <h2 className="h3">Current listings</h2>
            </div>
            <span className="badge badge-status-confirmed">{listings.length}</span>
          </div>
          {listings.length === 0 ? (
            <p className="empty-state-copy">No community spaces have been added yet.</p>
          ) : (
            <div className="admin-space-list">
              {listings.map((listing) => (
                <article className="admin-space-row" key={listing.id}>
                  <div>
                    <h3>{listing.title}</h3>
                    <p>
                      {communitySpaceTypeLabel(listing.spaceType)} ·{" "}
                      {listing.district ? listing.district + ", " : ""}
                      {listing.city}, {listing.country}
                    </p>
                  </div>
                  <div className="admin-space-row-meta">
                    <span className="badge">{listing.status}</span>
                    <span className="badge">{listing.verifiedAt ? "Verified" : "Unverified"}</span>
                    <strong>€{listing.monthlyPriceEur}/month</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
