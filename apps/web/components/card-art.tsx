/** Branded parking / urban asset visuals (no stock photos). */


const PALETTES: [string, string, string, string][] = [
  ["#0a4734", "#062d21", "#1f7a4d", "#b7f536"],
  ["#0e3524", "#062d21", "#155034", "#f05e3b"],
  ["#123a28", "#071f16", "#2a8a58", "#b7f536"],
  ["#0d3121", "#062d21", "#1c6a44", "#eee9dd"],
  ["#0a4734", "#041c15", "#227a4e", "#f05e3b"],
  ["#0f3a27", "#062d21", "#1f7a4d", "#b7f536"]
];

export function artPaletteIndex(variant: number): number {
  const n = Number.isFinite(variant) ? Math.trunc(variant) : 0;
  return ((n % PALETTES.length) + PALETTES.length) % PALETTES.length;
}

/** @deprecated use artPaletteIndex */
export const cardArtPaletteIndex = artPaletteIndex;

export function CardArt({
  variant = 0,
  idSuffix
}: {
  variant?: number;
  idSuffix?: string;
}) {
  return <AssetVisual variant={variant} idSuffix={idSuffix} scene="lot" />;
}

type Scene = "lot" | "aerial" | "street" | "hub";

export function AssetVisual({
  variant = 0,
  idSuffix,
  scene = "lot",
  label
}: {
  variant?: number;
  idSuffix?: string;
  scene?: Scene;
  label?: string;
}) {
  const idx = artPaletteIndex(variant);
  const [deep, deeper, mid, accent] = PALETTES[idx];
  const uid = `av-${idSuffix ?? idx}-${scene}`;

  if (scene === "aerial") {
    return (
      <svg className="card-art-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mid} />
            <stop offset="1" stopColor={deeper} />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill={`url(#${uid}-sky)`} />
        <rect x="40" y="70" width="560" height="240" rx="12" fill={deep} opacity="0.95" />
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 8 }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={60 + col * 66}
              y={90 + row * 42}
              width={50}
              height={28}
              rx="3"
              fill={col % 3 === row % 2 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)"}
              stroke="rgba(255,255,255,0.12)"
            />
          ))
        )}
        <rect x="40" y="70" width="16" height="240" fill={accent} opacity="0.85" />
        <text x="56" y="48" fontFamily="Manrope,sans-serif" fontSize="18" fontWeight="800" fill={accent}>
          {label ?? "PARKING"}
        </text>
      </svg>
    );
  }

  if (scene === "street") {
    return (
      <svg className="card-art-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="640" height="360" fill={deeper} />
        <rect x="0" y="220" width="640" height="140" fill={deep} />
        <rect x="80" y="80" width="90" height="140" fill={mid} opacity="0.7" />
        <rect x="190" y="50" width="70" height="170" fill={mid} opacity="0.55" />
        <rect x="280" y="90" width="110" height="130" fill={mid} opacity="0.8" />
        <rect x="420" y="40" width="80" height="180" fill={mid} opacity="0.5" />
        <rect x="520" y="100" width="70" height="120" fill={mid} opacity="0.65" />
        <rect x="120" y="250" width="70" height="36" rx="6" fill="rgba(255,255,255,0.16)" />
        <rect x="220" y="250" width="70" height="36" rx="6" fill={accent} opacity="0.7" />
        <rect x="320" y="250" width="70" height="36" rx="6" fill="rgba(255,255,255,0.12)" />
        <rect x="0" y="286" width="640" height="8" fill="rgba(255,255,255,0.2)" />
        <circle cx="560" cy="70" r="36" fill={accent} opacity="0.25" />
      </svg>
    );
  }

  if (scene === "hub") {
    return (
      <svg className="card-art-svg" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={deep} />
            <stop offset="1" stopColor={deeper} />
          </linearGradient>
        </defs>
        <rect width="640" height="360" fill={`url(#${uid}-g)`} />
        <ellipse cx="320" cy="300" rx="260" ry="40" fill="rgba(0,0,0,0.25)" />
        <rect x="180" y="120" width="280" height="150" rx="10" fill={mid} opacity="0.35" />
        <rect x="210" y="150" width="50" height="90" rx="4" fill="rgba(255,255,255,0.12)" />
        <rect x="280" y="150" width="50" height="90" rx="4" fill={accent} opacity="0.55" />
        <rect x="350" y="150" width="50" height="90" rx="4" fill="rgba(255,255,255,0.12)" />
        <rect x="300" y="70" width="40" height="50" fill={accent} />
        <text
          x="320"
          y="102"
          textAnchor="middle"
          fontFamily="Manrope,sans-serif"
          fontSize="22"
          fontWeight="800"
          fill={deeper}
        >
          P
        </text>
        <path d="M140 270 L320 200 L500 270" stroke={accent} strokeWidth="3" fill="none" opacity="0.5" />
      </svg>
    );
  }

  // default lot scene (card)
  const bays = [];
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 62;
    bays.push(
      <rect
        key={`bay-${i}`}
        x={x}
        y={120}
        width={46}
        height={96}
        rx={4}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
      />
    );
    if (i % 3 === 1) {
      bays.push(
        <rect
          key={`car-${i}`}
          x={x + 6}
          y={150}
          width={34}
          height={52}
          rx={6}
          fill="rgba(255,255,255,0.12)"
        />
      );
    }
  }

  return (
    <svg
      className="card-art-svg"
      viewBox="0 0 420 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={deep} />
          <stop offset="1" stopColor={deeper} />
        </linearGradient>
      </defs>
      <rect width="420" height="300" fill={`url(#${uid})`} />
      <circle cx={300 + idx * 12} cy={60 + idx * 8} r={110} fill={`${accent}22`} />
      <rect x="0" y="236" width="420" height="64" fill="rgba(0,0,0,0.25)" />
      {bays}
      <rect x="52" y="96" width="52" height="18" rx="4" fill={mid} />
      <text x="60" y="110" fontFamily="Manrope,sans-serif" fontSize="12" fontWeight="800" fill={accent}>
        P
      </text>
      <rect x="0" y="252" width="420" height="3" fill="rgba(255,255,255,0.14)" />
      <rect x="30" y="266" width="60" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
      <rect x="120" y="266" width="60" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
      <rect x="210" y="266" width="60" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
      <rect x="300" y="266" width="60" height="6" rx="3" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

export { OpportunityGallery } from "./opportunity-gallery";
