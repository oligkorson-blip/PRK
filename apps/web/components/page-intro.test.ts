import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageIntro } from "@/components/page-intro";

describe("PageIntro", () => {
  it("renders task/document variants as a neutral header with h2-scale title", () => {
    for (const variant of ["task", "document"] as const) {
      const html = renderToStaticMarkup(
        createElement(PageIntro, {
          variant,
          kicker: "Account",
          title: "Your documents",
          lead: "Everything in one place."
        })
      );
      expect(html).toContain("<header");
      expect(html).toContain(`page-intro-${variant}`);
      expect(html).toContain("container-narrow");
      expect(html).toContain('class="h2 page-intro-title"');
      expect(html).toContain("Account");
      expect(html).toContain("Everything in one place.");
      expect(html).not.toContain("<section");
    }
  });

  it("renders editorial variant as a dark hero section with display-l title", () => {
    const html = renderToStaticMarkup(
      createElement(PageIntro, { variant: "editorial", title: "Why parking" })
    );
    expect(html).toContain("<section");
    expect(html).toContain("page-intro-editorial");
    expect(html).toContain("page-hero");
    expect(html).toContain('class="display-l"');
  });

  it("renders functional variant compact with display-m title", () => {
    const html = renderToStaticMarkup(
      createElement(PageIntro, { variant: "functional", title: "Opportunities" })
    );
    expect(html).toContain("page-hero-compact");
    expect(html).toContain('class="display-m"');
  });

  it("omits kicker and lead when not provided and merges custom class names", () => {
    const html = renderToStaticMarkup(
      createElement(PageIntro, {
        variant: "campaign",
        title: "They park. You earn.",
        className: "home-hero"
      })
    );
    expect(html).toContain("page-intro-campaign home-hero");
    expect(html).not.toContain("kicker");
    expect(html).not.toContain('class="lead"');
  });

  it("forwards id and aria-labelledby on section variants", () => {
    const html = renderToStaticMarkup(
      createElement(PageIntro, {
        variant: "editorial",
        title: "About",
        id: "about-hero",
        "aria-labelledby": "about-title"
      })
    );
    expect(html).toContain('id="about-hero"');
    expect(html).toContain('aria-labelledby="about-title"');
  });
});
