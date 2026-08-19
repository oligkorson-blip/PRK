import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// SiteHeader is a client component; stub the client-only imports so the
// module loads and renders under the node environment. The session is
// controllable per test because catalogue links are members-only.
const sessionState: {
  current: { data: { user: { id: string } } | null; isPending: boolean };
} = { current: { data: null, isPending: false } };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/"
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => sessionState.current }
}));
// Server pages read the flag via this query.
vi.mock("@/lib/platform-settings/queries", () => ({
  isCommunitySpacesEnabled: vi.fn()
}));
// The host form is a client component driven by useActionState; stub the
// server action module and control the action state directly so the success
// branch can be rendered.
vi.mock("@/lib/community-spaces/host-actions", () => ({
  submitHostInterest: vi.fn()
}));
const hostActionState: { current: { ok: boolean; message?: string } | null } = { current: null };
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [hostActionState.current, vi.fn(), false] };
});

import { SiteHeader } from "@/components/site-header";
import { CommunitySpaceHostForm } from "@/components/community-space-host-form";
import ListASpacePage from "@/app/list-a-space/page";
import sitemap from "@/app/sitemap";
import { isCommunitySpacesEnabled } from "@/lib/platform-settings/queries";

const mockFlag = vi.mocked(isCommunitySpacesEnabled);

const SIGNED_OUT = { data: null, isPending: false } as const;
const SIGNED_IN = { data: { user: { id: "user-1" } }, isPending: false } as const;

beforeEach(() => {
  mockFlag.mockReset();
  hostActionState.current = null;
  sessionState.current = SIGNED_OUT;
});

describe("SiteHeader primary nav", () => {
  it("shows the Find parking link to signed-in members when community spaces are enabled", () => {
    sessionState.current = SIGNED_IN;
    const html = renderToStaticMarkup(createElement(SiteHeader, { communitySpacesEnabled: true }));
    expect(html).toContain('href="/spaces"');
    expect(html).toContain("Find parking");
  });

  it("hides the Find parking link from signed-in members when community spaces are disabled", () => {
    sessionState.current = SIGNED_IN;
    const html = renderToStaticMarkup(createElement(SiteHeader, { communitySpacesEnabled: false }));
    expect(html).not.toContain('href="/spaces"');
    expect(html).not.toContain("Find parking");
  });

  it("defaults to hiding the Find parking link (fail-safe)", () => {
    sessionState.current = SIGNED_IN;
    const html = renderToStaticMarkup(createElement(SiteHeader));
    expect(html).not.toContain('href="/spaces"');
  });

  it("never shows catalogue links to signed-out visitors, even when enabled", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { communitySpacesEnabled: true }));
    expect(html).not.toContain('href="/spaces"');
    expect(html).not.toContain('href="/opportunities"');
  });
});

describe("list-a-space page", () => {
  it("points visitors at the apply flow when community spaces are enabled", async () => {
    mockFlag.mockResolvedValue(true);
    const html = renderToStaticMarkup(await ListASpacePage());
    expect(html).toContain('href="/apply"');
    expect(html).not.toContain('href="/spaces"');
  });

  it("points visitors at the apply flow when community spaces are disabled", async () => {
    mockFlag.mockResolvedValue(false);
    const html = renderToStaticMarkup(await ListASpacePage());
    expect(html).toContain('href="/apply"');
    expect(html).not.toContain('href="/spaces"');
  });
});

describe("host form success state", () => {
  it("links to the spaces catalogue when community spaces are enabled", () => {
    hostActionState.current = { ok: true, message: "Thanks, we will be in touch." };
    const html = renderToStaticMarkup(
      createElement(CommunitySpaceHostForm, { communitySpacesEnabled: true })
    );
    expect(html).toContain('href="/spaces"');
    expect(html).toContain("Browse spaces");
  });

  it("omits the spaces catalogue link when community spaces are disabled", () => {
    hostActionState.current = { ok: true, message: "Thanks, we will be in touch." };
    const html = renderToStaticMarkup(createElement(CommunitySpaceHostForm));
    expect(html).not.toContain('href="/spaces"');
  });
});

describe("sitemap", () => {
  it("never publishes members-only catalogue URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).not.toContain("http://localhost:3000/spaces");
    expect(urls.some((url) => url.includes("/opportunities"))).toBe(false);
  });

  it("keeps public routes listed", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000/");
    expect(urls).toContain("http://localhost:3000/list-a-space");
  });
});
