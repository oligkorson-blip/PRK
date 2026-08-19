import Link from "next/link";

export function OperatorPartners() {
  return (
    <p className="field-hint stack-5" style={{ maxWidth: "62ch" }}>
      Some sites show a named operator; others use a generic label until we&apos;re cleared to share
      the name. A name never implies partnership or endorsement — see{" "}
      <Link href="/legal/terms">Terms</Link>.
    </p>
  );
}
