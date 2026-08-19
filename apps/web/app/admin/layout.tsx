import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { getStaffContext } from "@/lib/auth/staff";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
import { isDemoMode } from "@/lib/demo-mode";
import { staffTwoFactorRequired } from "@/lib/auth/staff-two-factor";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffContext();
  if (!staff) redirect("/");

  const twoFactorEnabled = await isTwoFactorEnabledForUser(staff.user.id);
  // This layout only wraps /admin/* — enroll lives on portal settings.
  if (
    staffTwoFactorRequired({
      demoMode: isDemoMode(),
      twoFactorEnabled,
      pathname: "/admin"
    })
  ) {
    redirect("/portal/settings?staff2fa=1");
  }

  return (
    <AdminShell role={staff.role} email={staff.user.email}>
      {children}
    </AdminShell>
  );
}
