type IconName =
  | "home"
  | "leads"
  | "people"
  | "request"
  | "payments"
  | "shield"
  | "document"
  | "team"
  | "asset"
  | "portal"
  | "settings"
  | "menu";

export function UiIcon({
  name,
  size = 18,
  className
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    leads: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
        <path d="m17 6 4-4M17 2h4v4" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M16 5.3a3 3 0 0 1 0 5.4M17 14c2.4.7 4 2.8 4 5.5" />
      </>
    ),
    request: (
      <>
        <path d="M6 3h12v18H6z" />
        <path d="M9 8h6M9 12h3M14 16l1.5 1.5L19 14" />
      </>
    ),
    payments: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 4.6-3.2 8.5-8 10-4.8-1.5-8-5.4-8-10V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    document: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h6M9 16h6" />
      </>
    ),
    team: (
      <>
        <circle cx="12" cy="7" r="3" />
        <circle cx="5" cy="10" r="2" />
        <circle cx="19" cy="10" r="2" />
        <path d="M7 21v-2a5 5 0 0 1 10 0v2M1.5 20v-1a3.5 3.5 0 0 1 4-3.5M22.5 20v-1a3.5 3.5 0 0 0-4-3.5" />
      </>
    ),
    asset: (
      <>
        <path d="M4 20V8l8-5 8 5v12" />
        <path d="M8 20v-5h8v5M8 10h.01M12 10h.01M16 10h.01" />
      </>
    ),
    portal: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M8 9v11" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6v.2h-4V21a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 3 14H2.8v-4H3a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 3V2.8h4V3a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21 10h.2v4H21a1.8 1.8 0 0 0-1.6 1Z" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    )
  };

  return (
    <svg {...common} className={className}>
      {paths[name]}
    </svg>
  );
}
