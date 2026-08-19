import { asc, eq } from "drizzle-orm";
import { db, communitySpaceListings } from "@/lib/db";

export async function listPublishedCommunitySpaces() {
  return db
    .select()
    .from(communitySpaceListings)
    .where(eq(communitySpaceListings.status, "published"))
    .orderBy(asc(communitySpaceListings.city), asc(communitySpaceListings.title));
}

export async function listCommunitySpacesForAdmin() {
  return db
    .select()
    .from(communitySpaceListings)
    .orderBy(
      asc(communitySpaceListings.status),
      asc(communitySpaceListings.city),
      asc(communitySpaceListings.title)
    );
}
