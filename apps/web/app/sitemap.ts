import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides/catalog";

export const dynamic = "force-dynamic";

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();

  const staticPaths = [
    "",
    "/list-a-space",
    "/how-it-works",
    "/why-parking",
    "/guides",
    "/about",
    "/faq",
    "/fees",
    "/contact",
    "/apply",
    "/documents",
    "/sign-in",
    "/legal/risk",
    "/legal/terms",
    "/legal/privacy",
    "/legal/cookies",
    "/legal/complaints"
  ];

  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${origin}${path || "/"}`,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7
  }));

  const guideEntries: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: `${origin}/guides/${guide.slug}`,
    lastModified: guide.reviewedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6
  }));

  return [...staticEntries, ...guideEntries];
}
