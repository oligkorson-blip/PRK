# Plan part — Area 1: Content & legal (Tasks 16–18)

Spec: `docs/superpowers/specs/2026-07-23-assisted-kyc-and-flow-fixes-design.md`, "Area 1: Content & legal" (findings 1–8).
Scope: `apps/web`. Run all commands from `apps/web` with `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"` first.

Covers findings: 1 (legal metadata), 2 (legal versioning) → Task 16; 3 (fee copy alignment), 4 (complaints escalation) → Task 17; 5 (guide cross-linking), 6 (Article JSON-LD), 7 (guides index risk line), 8 (copy defects) → Task 18.

## Notes verified against the real code (read before executing)

- **vitest needs one config line to render server components.** Tests here run in `environment: "node"` and no existing test renders React. `renderToStaticMarkup` on the app's pages fails with `ReferenceError: React is not defined` until `esbuild: { jsx: "automatic" }` is added to `vitest.config.ts` (verified: with the line, legal and guide pages render and assert fine). Task 16 Step 1 makes this change.
- **Async server components cannot be render-tested.** `JsonLd` (`components/json-ld.tsx`) is `async` and calls `headers()`; `renderToStaticMarkup` on a tree containing it throws. So Article JSON-LD is tested through a pure builder function (`lib/guides/article-jsonld.ts`), and guide pages are not render-tested after Task 18 adds `<JsonLd>` to them. Importing such a page module (e.g. to assert its `metadata` export) works fine — verified with `app/page.tsx`.
- **`app/legal/complaints/page.tsx` already has a `metadata` export**; `risk`, `terms`, `privacy`, `cookies` do not. Task 16 also rewires complaints' metadata through the new constants file so all five legal pages share one source (finding 2 says "per legal page").
- **Review-date placement varies across guide pages**: five pages show `N min read · Last reviewed 19 Jul 2026` in the hero (`field-hint stack-3`); `how-hub-income-is-stacked` and `european-parking-and-mobility-2026` show `Last reviewed 2026-07-19.` only in the `guide-footer` paragraph. Task 18 keeps each page's existing placement but renders every date from the single catalog field (ISO format everywhere).
- The qualified Terms wording being aligned to (`app/legal/terms/page.tsx:48-50`): "Unless separately disclosed in writing, Parkwise does not charge a platform fee on the public catalogue surfaces. Any future fees will be stated before they apply."
- **Effective dates in `LEGAL_META` are set to `2026-07-23`** (design-approval date) as placeholders — confirm with the team before merge; they live in exactly one file so this is a one-line-per-page change.
- **Task dependency**: Task 17 edits the body of `app/guides/how-fees-affect-returns/page.tsx`; Task 18's edit of the same page assumes Task 17 has landed.

---

### Task 16: Legal page metadata + single-source effective dates

**Files:**
- Create: `apps/web/lib/copy/legal-meta.ts`
- Create: `apps/web/tests/legal-metadata.test.tsx`
- Modify: `apps/web/vitest.config.ts` (add `esbuild: { jsx: "automatic" }` — enables rendering server components in tests)
- Modify: `apps/web/app/legal/risk/page.tsx`
- Modify: `apps/web/app/legal/terms/page.tsx`
- Modify: `apps/web/app/legal/privacy/page.tsx`
- Modify: `apps/web/app/legal/cookies/page.tsx`
- Modify: `apps/web/app/legal/complaints/page.tsx` (rewire existing metadata through `LEGAL_META`, add date line)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `LEGAL_META: Record<"risk" | "terms" | "privacy" | "cookies" | "complaints", { title: string; description: string; effective: string }>` (as const) — from `lib/copy/legal-meta.ts`
  - `LegalPageId = keyof typeof LEGAL_META`

- [ ] **Step 1: Enable the automatic JSX transform for vitest**

  Rendering server components in tests currently fails with `ReferenceError: React is not defined` (esbuild defaults to the classic JSX runtime). In `apps/web/vitest.config.ts`, change:

  ```ts
  export default defineConfig({
    test: {
  ```

  to:

  ```ts
  export default defineConfig({
    esbuild: { jsx: "automatic" },
    test: {
  ```

  Run: `npx vitest run` — expect the whole existing suite to still pass (the option only changes JSX transform; no existing test uses JSX).

- [ ] **Step 2: Write the failing test**

  Create `apps/web/tests/legal-metadata.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { LEGAL_META } from "@/lib/copy/legal-meta";
  import RiskPage, { metadata as riskMetadata } from "@/app/legal/risk/page";
  import TermsPage, { metadata as termsMetadata } from "@/app/legal/terms/page";
  import PrivacyPage, { metadata as privacyMetadata } from "@/app/legal/privacy/page";
  import CookiesPage, { metadata as cookiesMetadata } from "@/app/legal/cookies/page";
  import ComplaintsPage, { metadata as complaintsMetadata } from "@/app/legal/complaints/page";

  describe("legal page metadata", () => {
    it("risk page exports neutral metadata sourced from LEGAL_META", () => {
      expect(riskMetadata).toEqual({
        title: LEGAL_META.risk.title,
        description: LEGAL_META.risk.description
      });
    });

    it("terms page exports neutral metadata sourced from LEGAL_META", () => {
      expect(termsMetadata).toEqual({
        title: LEGAL_META.terms.title,
        description: LEGAL_META.terms.description
      });
    });

    it("privacy page exports neutral metadata sourced from LEGAL_META", () => {
      expect(privacyMetadata).toEqual({
        title: LEGAL_META.privacy.title,
        description: LEGAL_META.privacy.description
      });
    });

    it("cookies page exports neutral metadata sourced from LEGAL_META", () => {
      expect(cookiesMetadata).toEqual({
        title: LEGAL_META.cookies.title,
        description: LEGAL_META.cookies.description
      });
    });

    it("complaints page exports metadata sourced from LEGAL_META", () => {
      expect(complaintsMetadata).toEqual({
        title: LEGAL_META.complaints.title,
        description: LEGAL_META.complaints.description
      });
    });

    it("every legal page renders its effective date from LEGAL_META", () => {
      const pages = {
        risk: RiskPage,
        terms: TermsPage,
        privacy: PrivacyPage,
        cookies: CookiesPage,
        complaints: ComplaintsPage
      } as const;
      for (const [id, Page] of Object.entries(pages)) {
        const html = renderToStaticMarkup(createElement(Page));
        expect(html, id).toContain(`Last updated ${LEGAL_META[id as keyof typeof LEGAL_META].effective}`);
      }
    });

    it("effective dates are ISO calendar dates", () => {
      for (const meta of Object.values(LEGAL_META)) {
        expect(meta.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
  ```

  Run: `npx vitest run tests/legal-metadata.test.tsx` — expect FAIL (module `@/lib/copy/legal-meta` does not exist).

- [ ] **Step 3: Create `lib/copy/legal-meta.ts`**

  ```ts
  /**
   * Single source of truth for legal-page metadata and version stamps.
   * `effective` is the "Last updated" date rendered on each page (ISO format).
   * NOTE: 2026-07-23 dates are placeholders from the design date — confirm
   * the real effective dates before merge.
   */
  export const LEGAL_META = {
    risk: {
      title: "Risk disclosure",
      description:
        "What can go wrong with parking investments on Parkwise, in plain language. Capital at risk.",
      effective: "2026-07-23"
    },
    terms: {
      title: "Platform terms",
      description: "The rules for using Parkwise as an investor.",
      effective: "2026-07-23"
    },
    privacy: {
      title: "Privacy notice",
      description: "How Parkwise processes personal data under GDPR principles.",
      effective: "2026-07-23"
    },
    cookies: {
      title: "Cookie notice",
      description: "Which cookies and storage Parkwise uses, and why.",
      effective: "2026-07-23"
    },
    complaints: {
      title: "Complaints",
      description:
        "How to raise a complaint about the Parkwise investor platform, and how we aim to respond.",
      effective: "2026-07-23"
    }
  } as const;

  export type LegalPageId = keyof typeof LEGAL_META;
  ```

- [ ] **Step 4: Wire the four pages without metadata**

  `app/legal/risk/page.tsx` — add at the top (before the existing imports is fine; keep import style):

  ```ts
  import type { Metadata } from "next";
  import { LEGAL_META } from "@/lib/copy/legal-meta";

  export const metadata: Metadata = {
    title: LEGAL_META.risk.title,
    description: LEGAL_META.risk.description
  };
  ```

  and inside the hero, change:

  ```tsx
          <p className="lead">
            Capital is at risk. Read this before you apply or invest.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            Capital is at risk. Read this before you apply or invest.
          </p>
          <p className="field-hint stack-3">Last updated {LEGAL_META.risk.effective}.</p>
  ```

  `app/legal/terms/page.tsx` — same additions with `LEGAL_META.terms`; change:

  ```tsx
          <p className="lead">
            The rules for using Parkwise as an investor.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            The rules for using Parkwise as an investor.
          </p>
          <p className="field-hint stack-3">Last updated {LEGAL_META.terms.effective}.</p>
  ```

  `app/legal/privacy/page.tsx` — same additions with `LEGAL_META.privacy`; after the existing `<p className="lead">…</p>` block add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.privacy.effective}.</p>
  ```

  `app/legal/cookies/page.tsx` — same additions with `LEGAL_META.cookies`; after the existing `<p className="lead">…</p>` block add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.cookies.effective}.</p>
  ```

- [ ] **Step 5: Rewire complaints metadata and add its date line**

  `app/legal/complaints/page.tsx` — change:

  ```ts
  import type { Metadata } from "next";

  export const metadata: Metadata = {
    title: "Complaints",
    description:
      "How to raise a complaint about the Parkwise investor platform, and how we aim to respond."
  };
  ```

  to:

  ```ts
  import type { Metadata } from "next";
  import { LEGAL_META } from "@/lib/copy/legal-meta";

  export const metadata: Metadata = {
    title: LEGAL_META.complaints.title,
    description: LEGAL_META.complaints.description
  };
  ```

  and after the hero `<p className="lead">…</p>` add:

  ```tsx
          <p className="field-hint stack-3">Last updated {LEGAL_META.complaints.effective}.</p>
  ```

- [ ] **Step 6: Run tests — expect pass**

  Run: `npx vitest run tests/legal-metadata.test.tsx` — all 7 tests pass. Then `npx tsc --noEmit` — clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/vitest.config.ts apps/web/lib/copy/legal-meta.ts apps/web/tests/legal-metadata.test.tsx apps/web/app/legal/risk/page.tsx apps/web/app/legal/terms/page.tsx apps/web/app/legal/privacy/page.tsx apps/web/app/legal/cookies/page.tsx apps/web/app/legal/complaints/page.tsx
  git commit -m "Add legal page metadata and single-source effective dates"
  ```

---

### Task 17: Align "no platform fee" copy with Terms + complaints escalation route

**Files:**
- Create: `apps/web/tests/fee-copy.test.tsx`
- Modify: `apps/web/lib/copy/consumer.ts` (add `NO_PLATFORM_FEE_LINE`)
- Modify: `apps/web/app/fees/page.tsx`
- Modify: `apps/web/app/guides/how-fees-affect-returns/page.tsx`
- Modify: `apps/web/app/legal/complaints/page.tsx` (add escalation sentence; assumes Task 16's version as base)

**Interfaces:**
- Consumes: `LEGAL_META` from Task 16 (complaints page already imports it; no interface change)
- Produces: `NO_PLATFORM_FEE_LINE: string` from `lib/copy/consumer.ts` — the single qualified fee line used by both fee surfaces (Task 18 re-renders this page but does not change the constant)

- [ ] **Step 1: Write the failing test**

  Create `apps/web/tests/fee-copy.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { NO_PLATFORM_FEE_LINE } from "@/lib/copy/consumer";
  import FeesPage from "@/app/fees/page";
  import FeesGuidePage from "@/app/guides/how-fees-affect-returns/page";
  import ComplaintsPage from "@/app/legal/complaints/page";

  describe("no-platform-fee copy", () => {
    it("is qualified (today + opportunity-level costs), matching the Terms wording", () => {
      expect(NO_PLATFORM_FEE_LINE).toContain("does not charge a platform fee today");
      expect(NO_PLATFORM_FEE_LINE).toContain("opportunity documents");
    });

    it("fees page renders the shared qualified line", () => {
      const html = renderToStaticMarkup(createElement(FeesPage));
      expect(html).toContain(NO_PLATFORM_FEE_LINE);
    });

    it("how-fees-affect-returns guide renders the shared qualified line", () => {
      const html = renderToStaticMarkup(createElement(FeesGuidePage));
      expect(html).toContain(NO_PLATFORM_FEE_LINE);
    });

    it("complaints page names why statutory escalation does not apply", () => {
      const html = renderToStaticMarkup(createElement(ComplaintsPage));
      expect(html).toContain("do not cover complaints about this platform");
    });
  });
  ```

  (The constant deliberately avoids apostrophes so `renderToStaticMarkup` HTML-escaping cannot break the assertions.)

  Run: `npx vitest run tests/fee-copy.test.tsx` — expect FAIL (`NO_PLATFORM_FEE_LINE` is not exported).

- [ ] **Step 2: Add the shared line to `lib/copy/consumer.ts`**

  Append after `RISK_LINE_SHORT`:

  ```ts
  /**
   * Qualified "no platform fee" line — mirrors the Terms wording ("Unless
   * separately disclosed in writing, Parkwise does not charge a platform fee…")
   * for marketing surfaces. Keep free of apostrophes (asserted in rendered HTML).
   */
  export const NO_PLATFORM_FEE_LINE =
    "Parkwise does not charge a platform fee today. Any costs specific to an opportunity are set out in the opportunity documents before you invest.";
  ```

- [ ] **Step 3: Apply it in `app/fees/page.tsx`**

  Change the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";
  ```

  Change the hero lead:

  ```tsx
          <p className="lead">
            Parkwise does not charge a platform fee. Where an opportunity carries its own costs,
            they are set out in the opportunity documents before you invest.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">{NO_PLATFORM_FEE_LINE}</p>
  ```

- [ ] **Step 4: Apply it in `app/guides/how-fees-affect-returns/page.tsx`**

  Change the import:

  ```ts
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";
  ```

  Change the "Where fees appear" paragraph:

  ```tsx
          <p>
            Parkwise does not charge a platform fee. Where an opportunity carries structuring or
            administration fees, they are described in the opportunity documents before you confirm
            an investment. Where a figure is presented net of fees, the page says so.
          </p>
  ```

  to:

  ```tsx
          <p>
            {NO_PLATFORM_FEE_LINE} Where an opportunity carries structuring or administration fees,
            they are described in the opportunity documents before you confirm an investment. Where
            a figure is presented net of fees, the page says so.
          </p>
  ```

- [ ] **Step 5: Add the escalation-route sentence to `app/legal/complaints/page.tsx`**

  After the existing final paragraph ("If you remain dissatisfied, you may escalate through any statutory redress route available to you in your jurisdiction. This page does not limit mandatory consumer or investor protections."), add:

  ```tsx
          <p>
            Parkwise is not a regulated investment firm, so statutory financial-services ombudsman
            routes (such as the FSPO in Ireland) do not cover complaints about this platform;
            general consumer-protection and court routes in your jurisdiction remain available.
          </p>
  ```

- [ ] **Step 6: Run tests — expect pass**

  Run: `npx vitest run tests/fee-copy.test.tsx` — all 4 tests pass. Then `npx tsc --noEmit` and `npx vitest run` — clean.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/lib/copy/consumer.ts apps/web/tests/fee-copy.test.tsx apps/web/app/fees/page.tsx apps/web/app/guides/how-fees-affect-returns/page.tsx apps/web/app/legal/complaints/page.tsx
  git commit -m "Align no-platform-fee copy with Terms and add complaints escalation route"
  ```

---

### Task 18: Guides — cross-linking, Article JSON-LD, index risk line, copy defects

**Files:**
- Create: `apps/web/lib/guides/article-jsonld.ts`
- Create: `apps/web/components/guide-chrome.tsx`
- Create: `apps/web/tests/guides-catalog.test.ts`
- Create: `apps/web/tests/guide-article-jsonld.test.ts`
- Create: `apps/web/tests/guide-chrome.test.tsx`
- Modify: `apps/web/lib/guides/catalog.ts` (add `reviewedAt` per guide, `Guide` type, `getGuide`, `relatedGuides`)
- Modify: `apps/web/app/guides/page.tsx` (risk line)
- Modify: `apps/web/app/guides/how-to-read-a-parkwise-opportunity/page.tsx`
- Modify: `apps/web/app/guides/what-monthly-distributions-mean/page.tsx`
- Modify: `apps/web/app/guides/how-hub-income-is-stacked/page.tsx` (also fixes the stray-space metadata typo)
- Modify: `apps/web/app/guides/parking-investment-risks/page.tsx`
- Modify: `apps/web/app/guides/can-you-exit-early/page.tsx`
- Modify: `apps/web/app/guides/how-fees-affect-returns/page.tsx` (assumes Task 17 landed)
- Modify: `apps/web/app/guides/european-parking-and-mobility-2026/page.tsx`

**Interfaces:**
- Consumes: `NO_PLATFORM_FEE_LINE` from Task 17 (already in the fees guide body), `RISK_LINE` from `lib/copy/consumer.ts`, `JsonLd` from `components/json-ld.tsx`
- Produces:
  - `Guide` type and `getGuide(slug: string): Guide | undefined`, `relatedGuides(slug: string, count?: number): Guide[]` from `lib/guides/catalog.ts`; each `Guide` gains `reviewedAt: string` (ISO date)
  - `articleJsonLd(guide: Guide): Record<string, unknown>` from `lib/guides/article-jsonld.ts`
  - `GuideBreadcrumb()` and `RelatedGuides({ slug }: { slug: string })` from `components/guide-chrome.tsx`

- [ ] **Step 1: Write the failing catalog test**

  Create `apps/web/tests/guides-catalog.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { GUIDES, GUIDE_SLUGS, getGuide, relatedGuides } from "@/lib/guides/catalog";

  describe("guide catalog review dates", () => {
    it("every guide carries an ISO reviewedAt date", () => {
      for (const g of GUIDES) {
        expect(g.reviewedAt, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe("getGuide", () => {
    it("finds a guide by slug and returns undefined for unknown slugs", () => {
      expect(getGuide("can-you-exit-early")?.title).toBe("Can you exit early?");
      expect(getGuide("no-such-guide")).toBeUndefined();
    });
  });

  describe("relatedGuides", () => {
    it("excludes the guide itself and returns at most 3 entries", () => {
      const related = relatedGuides("parking-investment-risks");
      expect(related.length).toBeGreaterThanOrEqual(2);
      expect(related.length).toBeLessThanOrEqual(3);
      expect(related.map((g) => g.slug)).not.toContain("parking-investment-risks");
    });

    it("prefers guides from the same category", () => {
      const related = relatedGuides("what-monthly-distributions-mean");
      expect(related[0]?.category).toBe("Understanding returns");
      expect(related[0]?.slug).toBe("how-hub-income-is-stacked");
    });

    it("returns an empty list for an unknown slug", () => {
      expect(relatedGuides("no-such-guide")).toEqual([]);
    });

    it("only returns slugs that exist in the catalog", () => {
      for (const slug of GUIDE_SLUGS) {
        for (const g of relatedGuides(slug)) {
          expect(GUIDE_SLUGS).toContain(g.slug);
        }
      }
    });
  });
  ```

  Run: `npx vitest run tests/guides-catalog.test.ts` — expect FAIL (`getGuide`/`relatedGuides` not exported; `reviewedAt` missing).

- [ ] **Step 2: Extend `lib/guides/catalog.ts`**

  Add `reviewedAt` to the satisfies type — change:

  ```ts
  ] as const satisfies ReadonlyArray<{
    slug: string;
    title: string;
    dek: string;
    category: GuideCategory;
    minutes: number;
  }>;
  ```

  to:

  ```ts
  ] as const satisfies ReadonlyArray<{
    slug: string;
    title: string;
    dek: string;
    category: GuideCategory;
    minutes: number;
    reviewedAt: string;
  }>;
  ```

  Add `reviewedAt: "2026-07-19"` to every one of the seven entries (after the `minutes` line), e.g.:

  ```ts
  {
    slug: "how-to-read-a-parkwise-opportunity",
    title: "How to read a Parkwise opportunity",
    dek: "Labels, options, target returns, and what to check before you invest.",
    category: "Getting started",
    minutes: 4,
    reviewedAt: "2026-07-19"
  },
  ```

  Append at the end of the file:

  ```ts
  export type Guide = (typeof GUIDES)[number];

  export function getGuide(slug: string): Guide | undefined {
    return GUIDES.find((g) => g.slug === slug);
  }

  /** 2–3 related guides for cross-linking, same category first. */
  export function relatedGuides(slug: string, count = 3): Guide[] {
    const self = getGuide(slug);
    if (!self) return [];
    const rest = GUIDES.filter((g) => g.slug !== slug);
    const sameCategory = rest.filter((g) => g.category === self.category);
    const others = rest.filter((g) => g.category !== self.category);
    return [...sameCategory, ...others].slice(0, count);
  }
  ```

  Run: `npx vitest run tests/guides-catalog.test.ts` — expect pass.

- [ ] **Step 3: Write the failing JSON-LD test, then the builder**

  Create `apps/web/tests/guide-article-jsonld.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";

  describe("articleJsonLd", () => {
    it("builds an Article node with headline, dateModified and Organization author", () => {
      const guide = getGuide("can-you-exit-early");
      if (!guide) throw new Error("guide missing");
      const ld = articleJsonLd(guide);
      expect(ld["@context"]).toBe("https://schema.org");
      expect(ld["@type"]).toBe("Article");
      expect(ld.headline).toBe("Can you exit early?");
      expect(ld.description).toBe(guide.dek);
      expect(ld.dateModified).toBe("2026-07-19");
      expect(ld.author).toEqual({ "@type": "Organization", name: "Parkwise" });
    });
  });
  ```

  Run: `npx vitest run tests/guide-article-jsonld.test.ts` — expect FAIL (module missing).

  Create `apps/web/lib/guides/article-jsonld.ts`:

  ```ts
  import type { Guide } from "./catalog";

  /**
   * Article JSON-LD for guide pages. Pure builder (no next/headers) so it stays
   * unit-testable; pages render it via the async <JsonLd> component.
   */
  export function articleJsonLd(guide: Guide) {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.dek,
      dateModified: guide.reviewedAt,
      author: { "@type": "Organization", name: "Parkwise" }
    };
  }
  ```

  Run: `npx vitest run tests/guide-article-jsonld.test.ts` — expect pass.

- [ ] **Step 4: Write the failing chrome/metadata/index tests, then implement**

  Create `apps/web/tests/guide-chrome.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { createElement } from "react";
  import { renderToStaticMarkup } from "react-dom/server";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { RISK_LINE } from "@/lib/copy/consumer";
  import GuidesIndexPage from "@/app/guides/page";
  import { metadata as hubIncomeMetadata } from "@/app/guides/how-hub-income-is-stacked/page";

  describe("GuideBreadcrumb", () => {
    it("links back to all guides", () => {
      const html = renderToStaticMarkup(createElement(GuideBreadcrumb));
      expect(html).toContain('href="/guides"');
      expect(html).toContain("All guides");
    });
  });

  describe("RelatedGuides", () => {
    it("renders 2–3 related guide links and excludes the current guide", () => {
      const html = renderToStaticMarkup(
        createElement(RelatedGuides, { slug: "parking-investment-risks" })
      );
      expect(html).toContain("Related guides");
      expect(html).toContain('href="/guides/');
      expect(html).not.toContain('href="/guides/parking-investment-risks"');
    });
  });

  describe("guides index", () => {
    it("shows the standard risk line with a link to the risk disclosure", () => {
      const html = renderToStaticMarkup(createElement(GuidesIndexPage));
      expect(html).toContain(RISK_LINE);
      expect(html).toContain('href="/legal/risk"');
    });
  });

  describe("how-hub-income-is-stacked metadata", () => {
    it("has no stray space before the full stop", () => {
      expect(hubIncomeMetadata?.description).toBe(
        "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
      );
    });
  });
  ```

  Run: `npx vitest run tests/guide-chrome.test.tsx` — expect FAIL (`@/components/guide-chrome` missing; index has no risk line; description has `opportunities . Capital`).

  Create `apps/web/components/guide-chrome.tsx`:

  ```tsx
  import Link from "next/link";
  import { relatedGuides } from "@/lib/guides/catalog";

  /** Breadcrumb back to the guides index, rendered at the top of each article hero. */
  export function GuideBreadcrumb() {
    return (
      <p className="field-hint">
        <Link href="/guides">← All guides</Link>
      </p>
    );
  }

  /** "Related guides" cross-link block for the end of each article. */
  export function RelatedGuides({ slug }: { slug: string }) {
    const related = relatedGuides(slug);
    if (related.length === 0) return null;
    return (
      <nav aria-label="Related guides">
        <h2 className="h3">Related guides</h2>
        <ul>
          {related.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`}>{g.title}</Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  ```

  Fix the stray space in `app/guides/how-hub-income-is-stacked/page.tsx` metadata — change:

  ```ts
  export const metadata: Metadata = {
    title: "How parking investments generate income",
    description:
      "Parking, EV charging, and other income streams on Parkwise opportunities . Capital at risk."
  };
  ```

  to:

  ```ts
  export const metadata: Metadata = {
    title: "How parking investments generate income",
    description:
      "Parking, EV charging, and other income streams on Parkwise opportunities. Capital at risk."
  };
  ```

  Add the risk line to `app/guides/page.tsx` — change the import block:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { GUIDE_CATEGORIES, GUIDES } from "@/lib/guides/catalog";
  ```

  to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { GUIDE_CATEGORIES, GUIDES } from "@/lib/guides/catalog";
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  and change the hero:

  ```tsx
          <p className="lead">
            Plain-language guides on returns, risks, fees, and how parking investments work.
          </p>
  ```

  to:

  ```tsx
          <p className="lead">
            Plain-language guides on returns, risks, fees, and how parking investments work.
          </p>
          <p className="field-hint stack-3">
            {RISK_LINE} <Link href="/legal/risk">Read the risk disclosure</Link>.
          </p>
  ```

  Run: `npx vitest run tests/guide-chrome.test.tsx` — expect pass. Then `npx vitest run` — whole suite green.

- [ ] **Step 5: Commit the helpers**

  ```bash
  git add apps/web/lib/guides/catalog.ts apps/web/lib/guides/article-jsonld.ts apps/web/components/guide-chrome.tsx apps/web/tests/guides-catalog.test.ts apps/web/tests/guide-article-jsonld.test.ts apps/web/tests/guide-chrome.test.tsx apps/web/app/guides/page.tsx apps/web/app/guides/how-hub-income-is-stacked/page.tsx
  git commit -m "Add guide catalog review dates, related guides, Article JSON-LD builder, and guides index risk line"
  ```

- [ ] **Step 6: Wire all seven guide pages (exact edits)**

  Every page gets the same four changes: (a) new imports + `GUIDE` constant, (b) `<JsonLd>` as first child of `<main>`, (c) `<GuideBreadcrumb />` above the kicker in the hero, (d) review date rendered from `GUIDE.reviewedAt`, (e) `<RelatedGuides>` after the `guide-footer` paragraph. Per page:

  **`app/guides/how-to-read-a-parkwise-opportunity/page.tsx`** — change imports:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { RISK_LINE } from "@/lib/copy/consumer";
  ```

  to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";
  import { RISK_LINE } from "@/lib/copy/consumer";

  const GUIDE = getGuide("how-to-read-a-parkwise-opportunity")!;
  ```

  Change `<main>` and hero top:

  ```tsx
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Getting started</span>
  ```

  to:

  ```tsx
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Getting started</span>
  ```

  Change the hero hint:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  to:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  Change the footer:

  ```tsx
          <p className="field-hint guide-footer">{RISK_LINE}</p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">{RISK_LINE}</p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

  **`app/guides/what-monthly-distributions-mean/page.tsx`** — identical four edits with `const GUIDE = getGuide("what-monthly-distributions-mean")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            5 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  and the same `<JsonLd>`, `<GuideBreadcrumb />` (above `<span className="kicker">Understanding returns</span>`), and `<RelatedGuides slug={GUIDE.slug} />` after the footer paragraph.

  **`app/guides/how-hub-income-is-stacked/page.tsx`** — same imports block with `const GUIDE = getGuide("how-hub-income-is-stacked")!;`. This page has no `RISK_LINE` import and no hero hint; its imports are just `Link` and `Metadata`. Change `<main>`/hero top:

  ```tsx
    <main>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Guides · Understanding returns</span>
  ```

  to:

  ```tsx
    <main>
      <JsonLd data={articleJsonLd(GUIDE)} />
      <section className="page-hero">
        <div className="container">
          <GuideBreadcrumb />
          <span className="kicker">Guides · Understanding returns</span>
  ```

  Change the footer:

  ```tsx
          <p className="field-hint guide-footer">
            Figures on opportunity pages are targets, not guarantees. Capital at risk. Last reviewed
            2026-07-19.
          </p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">
            Figures on opportunity pages are targets, not guarantees. Capital at risk. Last reviewed{" "}
            {GUIDE.reviewedAt}.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

  **`app/guides/parking-investment-risks/page.tsx`** — identical four edits with `const GUIDE = getGuide("parking-investment-risks")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            6 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  kicker is `<span className="kicker">Risks</span>`; footer is `<p className="field-hint guide-footer">{RISK_LINE}</p>`.

  **`app/guides/can-you-exit-early/page.tsx`** — identical four edits with `const GUIDE = getGuide("can-you-exit-early")!;`, hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  kicker is `<span className="kicker">Investment terms</span>`.

  **`app/guides/how-fees-affect-returns/page.tsx`** — imports after Task 17 are `Link`, `Metadata`, `NO_PLATFORM_FEE_LINE, RISK_LINE`. Change to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";
  import { NO_PLATFORM_FEE_LINE, RISK_LINE } from "@/lib/copy/consumer";

  const GUIDE = getGuide("how-fees-affect-returns")!;
  ```

  Same `<JsonLd>` + `<GuideBreadcrumb />` (above `<span className="kicker">Fees</span>`), hero hint before:

  ```tsx
          <p className="field-hint stack-3">
            4 min read · Last reviewed 19 Jul 2026
          </p>
  ```

  after:

  ```tsx
          <p className="field-hint stack-3">
            {GUIDE.minutes} min read · Last reviewed {GUIDE.reviewedAt}
          </p>
  ```

  and `<RelatedGuides slug={GUIDE.slug} />` after `<p className="field-hint guide-footer">{RISK_LINE}</p>`.

  **`app/guides/european-parking-and-mobility-2026/page.tsx`** — imports are `Link`, `Metadata`, `Cite`. Change to:

  ```ts
  import Link from "next/link";
  import type { Metadata } from "next";
  import { Cite } from "@/components/cite";
  import { JsonLd } from "@/components/json-ld";
  import { GuideBreadcrumb, RelatedGuides } from "@/components/guide-chrome";
  import { articleJsonLd } from "@/lib/guides/article-jsonld";
  import { getGuide } from "@/lib/guides/catalog";

  const GUIDE = getGuide("european-parking-and-mobility-2026")!;
  ```

  Same `<JsonLd>` + `<GuideBreadcrumb />` (above `<span className="kicker">Guides · Parking and mobility</span>`). Change the footer:

  ```tsx
          <p className="field-hint guide-footer">
            Figures are public statistics or cited research, not forecasts of Parkwise returns.
            Capital at risk. See Risk disclosure. Last reviewed 2026-07-19.
          </p>
        </div>
      </article>
  ```

  to:

  ```tsx
          <p className="field-hint guide-footer">
            Figures are public statistics or cited research, not forecasts of Parkwise returns.
            Capital at risk. See Risk disclosure. Last reviewed {GUIDE.reviewedAt}.
          </p>
          <RelatedGuides slug={GUIDE.slug} />
        </div>
      </article>
  ```

- [ ] **Step 7: Verify**

  Run from `apps/web`: `npx tsc --noEmit` — clean; `npx vitest run` — whole suite green; `npm run build` — succeeds (catches any server-component/import mistake in the seven pages, which unit tests cannot render now that they contain the async `<JsonLd>`).

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/app/guides/
  git commit -m "Wire guide pages: breadcrumb, related guides, Article JSON-LD, catalog-sourced review dates"
  ```
