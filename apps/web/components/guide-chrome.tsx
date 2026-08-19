import Link from "next/link";
import { relatedGuides } from "@/lib/guides/catalog";
import { GUIDE_ILLUSTRATIVE_DISCLAIMER } from "@/lib/copy/consumer";

/** Always-visible marker that guide content is illustrative, not a live offering. */
export function GuideDisclaimer() {
  return <p className="field-hint guide-disclaimer">{GUIDE_ILLUSTRATIVE_DISCLAIMER}</p>;
}

/** Breadcrumb back to the guides index, rendered at the top of each article hero. */
export function GuideBreadcrumb() {
  return (
    <>
      <p className="field-hint">
        <Link className="guide-breadcrumb" href="/guides">← All guides</Link>
      </p>
      <GuideDisclaimer />
    </>
  );
}

/** "Related guides" cross-link block for the end of each article. */
export function RelatedGuides({ slug }: { slug: string }) {
  const related = relatedGuides(slug);
  if (related.length === 0) return null;
  return (
    <nav aria-label="Related guides">
      <h2 className="h3">Related guides</h2>
      <ul className="related-guides">
        {related.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`}>{g.title}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
