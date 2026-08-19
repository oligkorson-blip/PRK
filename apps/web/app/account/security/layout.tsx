import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account security",
  robots: { index: false, follow: false }
};

export default function AccountSecurityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
