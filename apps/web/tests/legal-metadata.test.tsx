import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LEGAL_META } from "@/lib/copy/legal-meta";
import { formatDateDdMmYyyy } from "@/lib/format";
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

  it("every legal page renders its effective date as DD-MM-YYYY", () => {
    const pages = {
      risk: RiskPage,
      terms: TermsPage,
      privacy: PrivacyPage,
      cookies: CookiesPage,
      complaints: ComplaintsPage
    } as const;
    for (const [id, Page] of Object.entries(pages)) {
      const html = renderToStaticMarkup(createElement(Page));
      const displayed = formatDateDdMmYyyy(LEGAL_META[id as keyof typeof LEGAL_META].effective);
      expect(html, id).toContain(`Last updated ${displayed}`);
    }
  });

  it("effective dates are stored as ISO calendar dates", () => {
    for (const meta of Object.values(LEGAL_META)) {
      expect(meta.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
