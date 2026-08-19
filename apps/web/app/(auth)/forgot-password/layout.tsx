import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a Parkwise account password reset."
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
