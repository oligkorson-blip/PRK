import { COMMUNITY_SPACE_TYPES, type CommunitySpaceType } from "./types";

export type CommunitySpaceCatalogueFilter = {
  city: string | null;
  spaceType: CommunitySpaceType | null;
};

export function normalizeCommunitySpaceCatalogueFilter(input: {
  city?: string | null;
  type?: string | null;
}): CommunitySpaceCatalogueFilter {
  const city = input.city?.trim() || null;
  const rawType = input.type?.trim() || null;
  const spaceType =
    rawType && (COMMUNITY_SPACE_TYPES as readonly string[]).includes(rawType)
      ? (rawType as CommunitySpaceType)
      : null;

  return { city, spaceType };
}

export function communitySpaceCities(
  spaces: readonly { city: string }[]
): string[] {
  return Array.from(
    new Set(spaces.map((space) => space.city.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

export function filterCommunitySpaces<
  T extends { city: string; spaceType: string }
>(spaces: readonly T[], filter: CommunitySpaceCatalogueFilter): T[] {
  return spaces.filter((space) => {
    if (filter.city && space.city !== filter.city) return false;
    if (filter.spaceType && space.spaceType !== filter.spaceType) return false;
    return true;
  });
}
