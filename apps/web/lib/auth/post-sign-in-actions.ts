"use server";

import { getStaffContext } from "@/lib/auth/staff";

export type PostSignInDestination = "/admin" | "/portal";

/**
 * Where a freshly authenticated user belongs: staff on the admin console,
 * investors on the portal. Called from client components only after a full
 * session cookie exists (password-only sign-in, or a completed 2FA
 * challenge) — during the pending two-factor cookie there is no session and
 * staff context cannot resolve.
 */
export async function resolvePostSignInDestination(): Promise<PostSignInDestination> {
  const staff = await getStaffContext();
  return staff ? "/admin" : "/portal";
}
