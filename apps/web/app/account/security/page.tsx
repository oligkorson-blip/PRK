import Link from "next/link";
import { redirect } from "next/navigation";
import { TwoFactorEnrollment } from "@/components/two-factor-enrollment";
import { isTwoFactorEnabledForUser } from "@/lib/auth/queries";
import { requireSessionUser } from "@/lib/auth/session";
import { getStaffContext } from "@/lib/auth/staff";

export default async function AccountSecurityPage() {
  let sessionUser;
  try {
    sessionUser = await requireSessionUser();
  } catch {
    redirect("/sign-in");
  }
  // Read the flag fresh from the user row: the session payload can predate an
  // enrollment or a break-glass reset within the same browser session.
  const twoFactorEnabled = await isTwoFactorEnabledForUser(sessionUser.id);
  const staff = await getStaffContext();
  const destination = staff ? "/admin" : "/portal";
  const backHref = staff ? "/admin" : "/portal/settings";
  const backLabel = staff ? "Back to admin" : "Back to portal settings";

  return (
    <main className="sign-in-page">
      <div className="portal-card portal-card-wide">
        <div className="portal-head">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Account security</span>
        </div>
        <h1>Protect your account</h1>
        <p>
          Add an authenticator code on top of your password. Enrollment is voluntary and takes about
          a minute — then you return to {staff ? "admin" : "your portal"}.
        </p>
        <TwoFactorEnrollment enabled={twoFactorEnabled} destination={destination} />
        <p className="portal-meta">
          <Link href={backHref}>{backLabel}</Link>
        </p>
      </div>
    </main>
  );
}
