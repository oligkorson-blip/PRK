import type { MetadataRoute } from "next";

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/portal",
          "/api",
          "/onboarding",
          "/set-password",
          "/sign-up",
          "/opportunities",
          "/spaces",
          "/help-me-choose"
        ]
      }
    ],
    sitemap: `${origin}/sitemap.xml`
  };
}
