import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const portalDir = path.join(process.cwd(), "app/portal");
const globalsCss = path.join(process.cwd(), "app/globals.css");

function read(rel: string): string {
  return readFileSync(path.join(portalDir, rel), "utf8");
}

describe("portal UX polish patterns", () => {
  it("defines the portal pattern kit in globals.css", () => {
    const css = readFileSync(globalsCss, "utf8");
    expect(css).toContain(".portal-page-head");
    expect(css).toContain(".portal-kv");
    expect(css).toContain(".portal-file-list");
    expect(css).toContain(".portal-file-row");
    expect(css).toContain(".portal-file-empty");
  });

  it("keeps admin-table out of the investor portal", () => {
    const pages = [
      "page.tsx",
      "settings/page.tsx",
      "kyc/page.tsx",
      "interests/page.tsx",
      "holdings/page.tsx",
      "holdings/[id]/page.tsx",
      "documents/page.tsx"
    ];
    for (const rel of pages) {
      expect(read(rel), rel).not.toMatch(/admin-table/);
    }
  });

  it("uses portal-kv and data-compact on settings", () => {
    const src = read("settings/page.tsx");
    expect(src).toContain("portal-page-head");
    expect(src).toContain("portal-kv");
    expect(src).toContain("data data-compact");
    expect(src).not.toContain("admin-table");
  });

  it("uses the public contact route for account help", () => {
    const src = read("settings/page.tsx");
    expect(src).not.toContain("ops@parkwise.eu");
    expect(src).toContain('href="/contact"');
    expect(src).toContain("Talk to the team");
  });

  it("uses portal file rows on KYC instead of interest-card", () => {
    const src = read("kyc/page.tsx");
    expect(src).toContain("portal-page-head");
    expect(src).toContain("portal-file-list");
    expect(src).toContain("portal-file-row");
    expect(src).toContain("No documents uploaded yet");
    expect(src).not.toContain("interest-card");
  });

  it("applies portal-page-head on every portal list/overview page", () => {
    const pages = [
      "page.tsx",
      "interests/page.tsx",
      "holdings/page.tsx",
      "holdings/[id]/page.tsx",
      "documents/page.tsx",
      "settings/page.tsx",
      "kyc/page.tsx"
    ];
    for (const rel of pages) {
      expect(read(rel), rel).toContain("portal-page-head");
    }
  });
});

describe("portal brand tokens (visual polish 2026-07-29)", () => {
  it("uses cream canvas and tokenized dash surfaces", () => {
    const css = readFileSync(globalsCss, "utf8");
    // Canonical intent: cream canvas (may appear as .dash { background: var(--cream) })
    expect(css).toMatch(/\.dash\s*\{[^}]*background:\s*var\(--cream\)/);
    // Late hex canvas must not remain as the winning override without cream
    expect(css).not.toMatch(/\.dash\s*\{\s*background:\s*#f4f6f3/);
  });

  it("does not force 8px radius on portal cards in late overrides", () => {
    const css = readFileSync(globalsCss, "utf8");
    // Guard: grouped late override that set border-radius: 8px on portal surfaces
    expect(css).not.toMatch(
      /\.dash-panel,\s*\n\.interest-card,\s*\n\.empty-state,\s*\n\.portal-banner\s*\{\s*\n\s*border-radius:\s*8px/
    );
  });

  it("keeps status-timeline styles defined for overview", () => {
    const css = readFileSync(globalsCss, "utf8");
    expect(css).toContain(".status-timeline");
    expect(css).toContain(".status-timeline-pill");
  });

  it("does not introduce admin selectors into portal page markup", () => {
    const pages = [
      "page.tsx",
      "settings/page.tsx",
      "kyc/page.tsx",
      "interests/page.tsx",
      "holdings/page.tsx",
      "holdings/[id]/page.tsx",
      "documents/page.tsx"
    ];
    for (const rel of pages) {
      expect(read(rel), rel).not.toMatch(/admin-shell|admin-nav|admin-table/);
    }
  });
});
