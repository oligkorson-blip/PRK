import type { ReactNode } from "react";

export type PageIntroVariant = "campaign" | "editorial" | "functional" | "task" | "document";

type PageIntroProps = {
  variant: PageIntroVariant;
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  /** Extra class on the section (e.g. home-hero) */
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
};

const VARIANT_CLASS: Record<PageIntroVariant, string> = {
  campaign: "page-intro page-intro-campaign",
  editorial: "page-intro page-intro-editorial page-hero",
  functional: "page-intro page-intro-functional page-hero page-hero-compact",
  task: "page-intro page-intro-task",
  document: "page-intro page-intro-document"
};

/**
 * Controlled page-introduction contract (Phase 4).
 * Campaign is homepage-only via dedicated markup; editorial/functional wrap dark heroes;
 * task/document are cream/neutral task headers.
 */
export function PageIntro({
  variant,
  kicker,
  title,
  lead,
  children,
  className = "",
  id,
  "aria-labelledby": ariaLabelledBy
}: PageIntroProps) {
  if (variant === "task" || variant === "document") {
    return (
      <header className={`${VARIANT_CLASS[variant]} ${className}`.trim()} id={id}>
        <div className="container container-narrow">
          {kicker ? <span className="kicker">{kicker}</span> : null}
          <h1 className="h2 page-intro-title">{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
          {children}
        </div>
      </header>
    );
  }

  return (
    <section
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      id={id}
      aria-labelledby={ariaLabelledBy}
    >
      <div className="container">
        {kicker ? <span className="kicker">{kicker}</span> : null}
        <h1 className={variant === "editorial" ? "display-l" : "display-m"}>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
        {children}
      </div>
    </section>
  );
}
