import { headers } from "next/headers";

/** Serialize JSON-LD for Next.js without XSS via `</script>` in values. */
export async function JsonLd({
  data
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  // Attach the per-request CSP nonce so the tag is explicitly allowed under
  // the nonce-based script-src policy set in middleware.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export function organizationJsonLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Parkwise",
    url: origin,
    description:
      "Investor platform for parking opportunities in selected European cities.",
    email: "contact@parkwise.eu",
    telephone: "+353-1-699-4240",
    areaServed: "EU"
  };
}

export function websiteJsonLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Parkwise",
    url: origin,
    description:
      "Invest in parking opportunities with the potential for recurring monthly income. Capital at risk."
  };
}
