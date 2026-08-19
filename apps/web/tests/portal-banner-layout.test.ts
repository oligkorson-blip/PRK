import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const documentsPage = path.join(process.cwd(), "app/portal/documents/page.tsx");
const globalsCss = path.join(process.cwd(), "app/globals.css");

describe("documents readiness banner", () => {
  it("keeps readiness guidance stacked and readable", () => {
    const page = readFileSync(documentsPage, "utf8");
    const css = readFileSync(globalsCss, "utf8");

    expect(page).toContain('className="portal-banner portal-banner-info" role="status"');
    expect(page).toContain("<strong>When an investment is ready</strong>");
    expect(page).toContain(
      "We’ll show you a plain-language summary first, then the complete agreement to review."
    );
    expect(page).not.toContain(
      "<span>We’ll show you a plain-language summary first, then the complete agreement to review."
    );
    expect(css).toMatch(
      /\.portal-banner-info\s*\{[^}]*display:\s*grid[^}]*gap:\s*var\(--space-2\)/
    );
    expect(css).toMatch(
      /\.portal-banner-info\s+\.link-arrow\s*\{[^}]*justify-self:\s*start/
    );
  });
});
