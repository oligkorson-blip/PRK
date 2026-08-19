import { isOnboardingComplete } from "@/lib/auth/gates";
import { getSessionUser } from "@/lib/auth/session";
import { getStaffContext } from "@/lib/auth/staff";
import { findInvestorByAuthUserId } from "@/lib/investors/queries";
import { isCommunitySpacesEnabled } from "@/lib/platform-settings/queries";
import { SiteHeader } from "@/components/site-header";

/** Server wrapper: staff + onboarding flags for header (no side-effect investor create). */
export async function SiteHeaderHost() {
  const [user, staff, communitySpacesEnabled] = await Promise.all([
    getSessionUser(),
    getStaffContext(),
    isCommunitySpacesEnabled()
  ]);

  let needsOnboarding = false;
  if (user) {
    const row = await findInvestorByAuthUserId(user.id);

    if (!row) {
      // Just signed up — prompt finish setup unless staff-only account
      needsOnboarding = !staff;
    } else {
      needsOnboarding = !isOnboardingComplete(row);
    }
  }

  return (
    <SiteHeader
      isStaff={Boolean(staff)}
      needsOnboarding={needsOnboarding}
      initialSignedIn={Boolean(user)}
      communitySpacesEnabled={communitySpacesEnabled}
    />
  );
}
