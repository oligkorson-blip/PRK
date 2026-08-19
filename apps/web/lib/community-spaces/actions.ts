"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { isUniqueViolation } from "@/lib/db/errors";
import { auditEvents, communitySpaceListings, db } from "@/lib/db";
import {
  COMMUNITY_SPACE_STATUSES,
  COMMUNITY_SPACE_TYPES,
  type CommunitySpaceStatus,
  type CommunitySpaceType
} from "./types";

export type CommunitySpaceActionState =
  | null
  | { ok: true }
  | { ok: false; error: string };

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createCommunitySpace(
  _previousState: CommunitySpaceActionState,
  formData: FormData
): Promise<CommunitySpaceActionState> {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }

  const title = value(formData, "title");
  const slug = value(formData, "slug").toLowerCase();
  const hostLabel = value(formData, "hostLabel") || "Private host";
  const rawSpaceType = value(formData, "spaceType");
  const city = value(formData, "city");
  const district = value(formData, "district");
  const country = value(formData, "country");
  const description = value(formData, "description");
  const accessNotes = value(formData, "accessNotes");
  const features = value(formData, "features")
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean)
    .slice(0, 8);
  const rawPrice = value(formData, "monthlyPriceEur");
  const rawStatus = value(formData, "status");
  const verified = formData.get("verified") === "on";

  if (!title || !city || !country) {
    return { ok: false, error: "Title, city, and country are required." };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "Use a URL-safe slug with lowercase letters, numbers, and hyphens." };
  }
  if (!COMMUNITY_SPACE_TYPES.some((type) => type === rawSpaceType)) {
    return { ok: false, error: "Choose a valid community space type." };
  }
  if (!COMMUNITY_SPACE_STATUSES.some((status) => status === rawStatus)) {
    return { ok: false, error: "Choose a valid publication status." };
  }

  const monthlyPriceEur = Number(rawPrice);
  if (!Number.isInteger(monthlyPriceEur) || monthlyPriceEur <= 0) {
    return { ok: false, error: "Monthly price must be a positive whole number in EUR." };
  }
  if (rawStatus === "published" && !verified) {
    return { ok: false, error: "A listing must be marked verified before it can be published." };
  }

  const spaceType = rawSpaceType as CommunitySpaceType;
  const status = rawStatus as CommunitySpaceStatus;
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [listing] = await tx
        .insert(communitySpaceListings)
        .values({
          title,
          slug,
          hostLabel,
          spaceType,
          city,
          district,
          country,
          description,
          accessNotes,
          monthlyPriceEur,
          features,
          status,
          verifiedAt: verified ? now : null,
          createdBy: admin.id,
          updatedBy: admin.id,
          createdAt: now,
          updatedAt: now
        })
        .returning({ id: communitySpaceListings.id });

      if (!listing) {
        throw new Error("The listing could not be created.");
      }

      await tx.insert(auditEvents).values({
        actorUserId: admin.id,
        action: "community_space.created",
        entityType: "community_space",
        entityId: listing.id,
        payload: { slug, spaceType, status, verified, features }
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "That slug is already in use. Choose a different slug." };
    }
    throw error;
  }

  revalidatePath("/spaces");
  revalidatePath("/admin/spaces");
  revalidatePath("/sitemap.xml");

  return { ok: true };
}
