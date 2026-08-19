import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false }
};

export default function TwoFactorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
