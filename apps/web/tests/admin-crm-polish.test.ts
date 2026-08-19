import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("admin CRM polish patterns", () => {
  it("wraps the investors list in AdminSection with empty-state and shared pagination", () => {
    const src = read("app/admin/investors/page.tsx");
    expect(src).toContain("AdminSection");
    expect(src).toContain("empty-state");
    expect(src).toContain("LeadsPagination");
    expect(src).toContain('itemLabel="investors"');
    expect(src).toContain("APPLICATION_STATUS_LABEL");
    expect(src).not.toMatch(/const APPLICATION_STATUS_LABEL/);
  });

  it("uses lead-facts for investor profile/application and empty-state for voids", () => {
    const src = read("components/admin-investor-detail-tabs.tsx");
    expect(src).toContain('className="lead-facts"');
    expect(src).toContain("empty-state");
    expect(src).toContain("APPLICATION_STATUS_LABEL");
    expect(src).toContain("INTEREST_STATUS_LABEL");
    expect(src).not.toContain("style={{ marginBottom");
  });

  it("aligns lead detail back link with investor detail", () => {
    const src = read("app/admin/leads/lead/[leadId]/page.tsx");
    expect(src).toContain("Back to leads");
    expect(src).not.toContain("← All leads");
  });

  it("lets LeadsPagination label the noun", () => {
    const src = read("components/admin/leads-pagination.tsx");
    expect(src).toContain("itemLabel");
    expect(src).toContain("{total} {itemLabel}");
  });
});
