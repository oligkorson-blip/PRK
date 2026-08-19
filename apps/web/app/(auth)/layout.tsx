import type { Metadata } from "next";

// Shared chrome for credential auth pages. Marketing header/footer are hidden
// via isAuthPath (also covers /onboarding, /two-factor, /account/security).
// Children inherit the noindex robots metadata.
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="sign-in-page">{children}</main>;
}
