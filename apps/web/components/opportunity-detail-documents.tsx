import Link from "next/link";

const DOCUMENTS = [
  {
    title: "Risk disclosure",
    href: "/legal/risk",
    blurb: "Capital, income, and liquidity risks for Parkwise opportunities."
  },
  {
    title: "Platform terms",
    href: "/legal/terms",
    blurb: "How the Parkwise platform works for applicants and investors."
  },
  {
    title: "Fees overview",
    href: "/fees",
    blurb: "How fees work on Parkwise, in plain terms."
  },
  {
    title: "Platform documents",
    href: "/documents",
    blurb: "Supporting materials for reviewing opportunities."
  },
  {
    title: "How to read a Parkwise opportunity",
    href: "/guides/how-to-read-a-parkwise-opportunity",
    blurb: "A plain-English guide to the figures and terms on this page."
  }
] as const;

export function OpportunityDetailDocuments() {
  return (
    <section id="documents" className="detail-block">
      <p className="detail-section-kicker">Documents</p>
      <h2 className="h3">Worth reading before you go further</h2>
      <ul className="doc-list">
        {DOCUMENTS.map((doc) => (
          <li key={doc.href} className="doc-row">
            <div>
              <Link href={doc.href} className="doc-row-title">
                {doc.title}
              </Link>
              <p className="field-hint">{doc.blurb}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
