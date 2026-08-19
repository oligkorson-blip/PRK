import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("spacing rhythm close-out", () => {
  const css = read("app/globals.css");

  it("keeps the shared token + utility contract", () => {
    expect(css).toMatch(/--space-1:\s*4px/);
    expect(css).toMatch(/--space-12:\s*88px/);
    expect(css).toMatch(/--section:\s*var\(--space-12\)/);
    expect(css).toMatch(/--section-tight:\s*var\(--space-10\)/);
    expect(css).toContain(".section { padding-block: var(--section); }");
    expect(css).toContain(".section-tight { padding-block: var(--section-tight); }");
    expect(css).toContain(".cta-lead { margin: var(--space-5) 0 var(--space-7); }");
    expect(css).toContain(".section-foot { margin-top: var(--space-8); }");
    expect(css).toContain(".stack-3 { margin-top: var(--space-3); }");
    expect(css).toContain(".stack-6 { margin-top: var(--space-6); }");
    expect(css).toContain(".container-narrow { max-width: var(--container-narrow); }");
  });

  it("preserves shell-owned insets (admin page 0, dash section-tight override)", () => {
    expect(css).toMatch(/\.admin-page\s*\{[^}]*padding-block:\s*0/s);
    expect(css).toContain(".dash-content .section-tight { padding-block: 0 var(--space-7); }");
    expect(css).not.toMatch(/\.portal-page\s*\{/);
  });

  it("keeps detail-block single-spaced (no stacked margin-bottom)", () => {
    expect(css).toMatch(
      /\.detail-block\s*\{[^}]*padding-bottom:\s*var\(--space-8\)[^}]*margin-bottom:\s*0/s
    );
  });

  it("wires phone page-hero and on-scale shell gaps through tokens", () => {
    expect(css).toContain(".page-hero .container { padding-block: var(--space-10); }");
    expect(css).toContain(".admin-page { display: flex; flex-direction: column; padding-block: 0; max-width: 1100px; gap: var(--space-5); }");
    expect(css).toContain(".dash-content { display: flex; flex-direction: column; gap: var(--space-2); }");
    expect(css).toContain("scroll-margin-top: var(--detail-sticky-offset);");
  });

  it("does not stack marketing section with section-tight in app routes", () => {
    const offenders: string[] = [];
    for (const rel of [
      "app/onboarding/page.tsx",
      "app/apply/page.tsx",
      "app/page.tsx",
      "app/fees/page.tsx",
      "app/faq/page.tsx"
    ]) {
      const src = read(rel);
      if (/className="[^"]*\bsection\b[^"]*\bsection-tight\b/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
