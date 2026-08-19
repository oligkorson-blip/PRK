import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Parkwise — invest in parking assets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#F4F7F2",
              color: "#0F3D2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 700
            }}
          >
            P
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>Parkwise</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
          <div
            style={{
              fontSize: 64,
              lineHeight: 1.08,
              fontWeight: 700,
              letterSpacing: "-0.03em"
            }}
          >
            They park. You earn.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: "#D7E5DC",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              maxWidth: 860
            }}
          >
            Parking near the stations, airports, and city centres people already use.
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
          Capital at risk. Monthly income and returns are not guaranteed.
        </div>
      </div>
    ),
    { ...size }
  );
}
