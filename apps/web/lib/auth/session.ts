import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

// React cache(): resolve the session once per request — layout, page, and
// header host share the memoized result instead of each re-querying.
export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) return null;
  // emailVerified rides along so the unclaimed-investor claim path
  // (lib/auth/investor.ts) can refuse to attach KYC/holdings data to an
  // unverified address when email verification is switched on.
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true
  };
});

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

// Page-level gate for members-only routes: sends visitors without a valid
// session to /sign-in instead of the error boundary (a stale cookie passes
// the middleware check but fails session resolution here). Only the expected
// UNAUTHENTICATED case redirects — anything else (e.g. a session-store
// outage) rethrows so it surfaces instead of masquerading as a sign-out.
// redirect() throws NEXT_REDIRECT from the catch arm below, so it is never
// re-caught here.
export async function requireSessionUserOrRedirect() {
  try {
    return await requireSessionUser();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    throw error;
  }
}
