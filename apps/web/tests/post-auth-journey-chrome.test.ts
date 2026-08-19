import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readApp(rel: string): string {
  return readFileSync(path.join(root, "app", rel), "utf8");
}

describe("post-auth journey chrome", () => {
  it("keeps onboarding on focused auth chrome without marketing page-hero", () => {
    const src = readApp("onboarding/page.tsx");
    expect(src).toContain("sign-in-page");
    expect(src).toContain("portal-card-onboarding");
    expect(src).toContain("Before your portal");
    expect(src).toContain("robots: { index: false, follow: false }");
    expect(src).not.toContain("page-hero");
    expect(src).not.toContain("onboarding-layout");
  });

  it("gives account security a back path into portal settings or admin", () => {
    const src = readApp("account/security/page.tsx");
    expect(src).toContain("/portal/settings");
    expect(src).toContain("Back to portal settings");
    expect(src).toContain("Back to admin");
    expect(src).toContain("sign-in-page");
  });

  it("keeps the 2FA challenge on portal-card with cancel to sign-in", () => {
    const src = readApp("two-factor/page.tsx");
    expect(src).toContain("sign-in-page");
    expect(src).toContain("portal-card");
    expect(src).toContain('href="/sign-in"');
  });
});
