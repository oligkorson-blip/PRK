import Link from "next/link";
import { TwoFactorChallenge } from "@/components/two-factor-challenge";

export default function TwoFactorPage() {
  return (
    <main className="sign-in-page">
      <div className="portal-card">
        <div className="portal-head">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>Parkwise account</span>
        </div>
        <h1>Two-factor verification</h1>
        <p>Enter the current code from your authenticator app.</p>
        <TwoFactorChallenge />
        <p className="portal-meta">
          <Link href="/sign-in">Cancel and return to sign in</Link>
        </p>
      </div>
    </main>
  );
}
