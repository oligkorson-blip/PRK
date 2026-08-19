import Link from "next/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { ASSET_STATUS_LABEL } from "@/lib/assets/labels";
import { listAllAssets } from "@/lib/assets/queries";
import { formatEur, formatYieldPct } from "@/lib/format";
import { AssetStatusActions } from "@/components/asset-status-actions";
import { AssetImageForm } from "@/components/asset-image-form";
import { AssetCapacityForm } from "@/components/asset-capacity-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

const STATUS_PILL_CLASS: Record<string, string> = {
  draft: "stage-pill-muted",
  published: "stage-pill-clear",
  closed: "stage-pill-new"
};

function imageCount(asset: {
  coverImageUrl: string | null;
  galleryImageUrls: string[] | null;
}): number {
  return (asset.coverImageUrl ? 1 : 0) + (asset.galleryImageUrls?.length ?? 0);
}

export default async function AdminAssetsPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const rows = await listAllAssets();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Opportunities"
        subtitle="Create, customize, review, and publish provider-managed parking investment opportunities. Private or residential spaces belong in Community spaces."
        actions={
          <Link className="btn btn-primary" href="/admin/assets/new">
            New opportunity
          </Link>
        }
      />

      <div className="table-wrap">
        <table className="admin-table assets-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Yield</th>
              <th scope="col">Min ticket</th>
              <th scope="col">Status</th>
              <th scope="col">Capacity</th>
              <th scope="col">Images</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="field-hint">
                  No opportunities yet — create your first one.
                </td>
              </tr>
            ) : null}
            {rows.map((a) => {
              const images = imageCount(a);
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td>
                      <b>{a.name}</b>
                      <div className="field-hint">
                        {a.city} · {a.country}
                      </div>
                      <div className="asset-phone-metrics">
                        <span>
                          Yield <strong>{formatYieldPct(a.targetYieldPct)}</strong>
                        </span>
                        <span>
                          Min ticket <strong>{formatEur(a.minTicketEur)}</strong>
                        </span>
                      </div>
                    </td>
                    <td>{formatYieldPct(a.targetYieldPct)}</td>
                    <td>{formatEur(a.minTicketEur)}</td>
                    <td>
                      <span
                        className={`stage-pill ${STATUS_PILL_CLASS[a.status] ?? "stage-pill-muted"}`}
                      >
                        {ASSET_STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </td>
                    <td>{a.advisoryCapacityEur ? formatEur(a.advisoryCapacityEur) : "—"}</td>
                    <td>{images > 0 ? <span className="badge badge-soft">{images}</span> : "—"}</td>
                    <td>
                      {a.status === "draft" ? (
                        <Link className="btn btn-ghost btn-sm" href={`/admin/assets/${a.id}/edit`}>
                          Edit
                        </Link>
                      ) : null}
                      <AssetStatusActions assetId={a.id} name={a.name} status={a.status} />
                    </td>
                  </tr>
                  {a.status !== "draft" ? (
                    <tr>
                      <td colSpan={7}>
                        <details>
                          <summary className="link-arrow">Edit capacity &amp; images</summary>
                          <div className="admin-grid-2 stack-3">
                            <AssetCapacityForm
                              assetId={a.id}
                              advisoryCapacityEur={a.advisoryCapacityEur}
                            />
                            <AssetImageForm
                              assetId={a.id}
                              coverImageUrl={a.coverImageUrl}
                              galleryImageUrls={a.galleryImageUrls ?? []}
                              coverImageCaption={a.coverImageCaption}
                            />
                          </div>
                        </details>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
