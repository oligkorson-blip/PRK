import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { emptyAssetFormInput } from "@/lib/assets/asset-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AssetForm } from "@/components/asset-form";

export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/");
    throw error;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="New opportunity"
        subtitle="Creates a draft. Publish it from the assets list when the content is ready."
      />
      <AssetForm mode="create" initial={emptyAssetFormInput()} />
    </div>
  );
}
