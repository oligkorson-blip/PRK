import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { assets, db } from "@/lib/db";
import { assetToFormInput } from "@/lib/assets/asset-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AssetCapacityForm } from "@/components/asset-capacity-form";
import { AssetForm } from "@/components/asset-form";
import { AssetImageForm } from "@/components/asset-image-form";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  const { id } = await params;
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!asset) notFound();
  // Published assets stay status-managed only (spec C.2).
  if (asset.status !== "draft") redirect("/admin/assets");

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={`Edit ${asset.name}`}
        subtitle="Draft opportunity — publish it from the assets list when the content is ready."
      />
      <AssetForm mode="edit" assetId={asset.id} initial={assetToFormInput(asset)} />
      <AdminSection title="Capacity & images">
        <div className="admin-grid-2">
          <AssetCapacityForm assetId={asset.id} advisoryCapacityEur={asset.advisoryCapacityEur} />
          <AssetImageForm
            assetId={asset.id}
            coverImageUrl={asset.coverImageUrl}
            galleryImageUrls={asset.galleryImageUrls ?? []}
            coverImageCaption={asset.coverImageCaption}
          />
        </div>
      </AdminSection>
    </div>
  );
}
