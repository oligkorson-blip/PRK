import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/sign-up-form";
import { areSignupsDisabled } from "@/lib/auth/signups";

/**
 * Public self-serve signup is closed (apply-first).
 * Temporary bootstrap: ALLOW_BOOTSTRAP_SIGNUP=true for first SUPER_ADMIN only.
 */
export default function SignUpPage() {
  if (areSignupsDisabled()) {
    redirect("/apply");
  }

  return (
    <section className="section">
      <p className="field-hint">
        Bootstrap mode — create the first ops account listed in{" "}
        <code>SUPER_ADMIN_EMAILS</code>, then unset{" "}
        <code>ALLOW_BOOTSTRAP_SIGNUP</code>.
      </p>
      <SignUpForm />
    </section>
  );
}
