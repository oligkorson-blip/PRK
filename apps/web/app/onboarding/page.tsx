import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ensureInvestor } from "@/lib/auth/investor";
import { isOnboardingComplete } from "@/lib/auth/gates";
import { getStaffContext } from "@/lib/auth/staff";
import { db, investorApplications } from "@/lib/db";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata: Metadata = {
  title: "Investor setup",
  description: "Confirm eligibility and acknowledge risk before investing on Parkwise.",
  robots: { index: false, follow: false }
};

export default async function OnboardingPage() {
  if (await getStaffContext()) redirect("/admin");

  let investor;
  try {
    investor = await ensureInvestor();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/sign-in");
    throw error;
  }

  if (isOnboardingComplete(investor)) {
    redirect("/portal");
  }

  const accountType = investor.accountType ?? "individual";

  // Company applicants get their entity details prefilled from the latest
  // application; values already saved on the investor row win on re-render.
  let defaultCompanyLegalName = investor.companyLegalName ?? "";
  let defaultCountryOfIncorporation = investor.countryOfIncorporation ?? "";
  if (accountType === "company" && (!defaultCompanyLegalName || !defaultCountryOfIncorporation)) {
    const [application] = await db
      .select({
        companyLegalName: investorApplications.companyLegalName,
        countryOfIncorporation: investorApplications.countryOfIncorporation
      })
      .from(investorApplications)
      .where(eq(investorApplications.investorId, investor.id))
      .orderBy(desc(investorApplications.createdAt))
      .limit(1);
    defaultCompanyLegalName ||= application?.companyLegalName ?? "";
    defaultCountryOfIncorporation ||= application?.countryOfIncorporation ?? "";
  }

  return (
    <main className="sign-in-page">
      <div className="portal-card portal-card-onboarding">
        <div className="portal-head">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>Before your portal</span>
        </div>
        <h1>A few questions before you invest</h1>
        <p>
          Takes about a minute — required once, then you continue into your investor portal.
        </p>
        <OnboardingForm
          accountType={accountType}
          defaultFullName={investor.fullName}
          defaultCountry={investor.country}
          defaultPhone={investor.phone ?? ""}
          defaultCompanyLegalName={defaultCompanyLegalName}
          defaultCountryOfIncorporation={defaultCountryOfIncorporation}
        />
      </div>
    </main>
  );
}
