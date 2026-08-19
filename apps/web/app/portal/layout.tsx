import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PortalShell } from "@/components/portal-shell";
import { ensureInvestor } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
import { getStaffContext } from "@/lib/auth/staff";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (await getStaffContext()) redirect("/admin");

  let investor;
  try {
    investor = await ensureInvestor();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/sign-in");
    throw error;
  }

  // Centralized onboarding gate for every /portal page (lives here, not in
  // each page). /onboarding itself is outside /portal, so it is unaffected.
  if (!isOnboardingComplete(investor)) redirect("/onboarding");

  return (
    <PortalShell name={investor.fullName} email={investor.email}>
      {children}
    </PortalShell>
  );
}
