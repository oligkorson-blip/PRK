import { ImageResponse } from "next/og";
import { getSessionUser } from "@/lib/auth/session";
import { getPublishedAssetBySlug } from "@/lib/assets";
import { formatYieldBand } from "@/lib/assets/investment-options";

export const alt = "Parkwise parking investment opportunity";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpportunityOpenGraphImage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await getSessionUser())) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const asset = await getPublishedAssetBySlug(slug);

  const title = asset?.name ?? "Parking opportunity";
  const location = asset ? `${asset.city}, ${asset.country}` : "Parkwise";
  const yieldLabel = asset
    ? asset.investmentOptions?.length
      ? formatYieldBand(asset.investmentOptions)
      : `${Number(asset.targetYieldPct).toFixed(1)}%`
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(145deg, #0F3D2E 0%, #1A5C45 55%, #243D33 100%)",
          color: "#F4F7F2",
          fontFamily: "Georgia, 'Times New Roman', serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "#F4F7F2",
              color: "#0F3D2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700
            }}
          >
            P
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>Parkwise</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1000 }}>
          <div
            style={{
              fontSize: 54,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: "-0.03em"
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#D7E5DC",
              fontFamily: "ui-sans-serif, system-ui, sans-serif"
            }}
          >
            {`${location}${yieldLabel ? ` · Target ${yieldLabel}` : ""}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: "#A9C4B4",
            fontFamily: "ui-sans-serif, system-ui, sans-serif"
          }}
        >
          Capital at risk. Target returns are not guaranteed.
        </div>
      </div>
    ),
    { ...size }
  );
}
