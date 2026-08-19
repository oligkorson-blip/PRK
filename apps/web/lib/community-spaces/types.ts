export const COMMUNITY_SPACE_TYPES = [
  "residential",
  "ev_station",
  "garage",
  "private_lot"
] as const;

export type CommunitySpaceType = (typeof COMMUNITY_SPACE_TYPES)[number];

export const COMMUNITY_SPACE_TYPE_LABELS: Record<CommunitySpaceType, string> = {
  residential: "Residential space",
  ev_station: "EV charging bay",
  garage: "Garage",
  private_lot: "Private lot"
};

export const COMMUNITY_SPACE_STATUSES = ["draft", "published", "paused"] as const;
export type CommunitySpaceStatus = (typeof COMMUNITY_SPACE_STATUSES)[number];

export const COMMUNITY_SPACE_STATUS_LABELS: Record<CommunitySpaceStatus, string> = {
  draft: "Draft",
  published: "Published",
  paused: "Paused"
};

export function communitySpaceTypeLabel(type: string): string {
  return COMMUNITY_SPACE_TYPE_LABELS[type as CommunitySpaceType] ?? type;
}
