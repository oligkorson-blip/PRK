export async function register() {
if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warnIfBootstrapSignupOpen } = await import("@/lib/auth/signups");
    warnIfBootstrapSignupOpen();
    const { warnIfSuperAdminFallback } = await import("@/lib/auth/roles");
    warnIfSuperAdminFallback();
  }
}
