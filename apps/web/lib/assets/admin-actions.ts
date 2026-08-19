"use server";

import { and, eq } from "drizzle-orm";
import { isUniqueViolation } from "@/lib/db/errors";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { assets, auditEvents, db, interests } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { parseAdvisoryCapacityInput } from "@/lib/assets/advisory-capacity";
import {
  isSafeHttpUrl,
  validateAssetForm,
  type AssetFormInput
} from "@/lib/assets/asset-form";

export type AssetStatus = "draft" | "published" | "closed";

export async function setAssetStatus(input: {
  assetId: string;
  status: AssetStatus;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let userId: string;
  try {
    const staff = await requireSuperAdmin();
    userId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  if (!["draft", "published", "closed"].includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const [existing] = await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
  if (!existing) return { ok: false, error: "Asset not found." };

  // Closed is terminal: interests were resolved and holdings/distributions
  // reference the final terms, so a closed opportunity is never revived.
  if (existing.status === "closed" && input.status !== "closed") {
    return { ok: false, error: "A closed opportunity cannot be reopened." };
  }

  // Defence in depth for legacy or externally imported drafts. The admin form
  // requires these values, but incomplete rows must never publish misleading facts.
  const occupancyPct = Number(existing.occupancyPct);
  const operatingProfileInvalid =
    !Number.isInteger(existing.spaces) ||
    existing.spaces <= 0 ||
    !Number.isFinite(occupancyPct) ||
    occupancyPct <= 0 ||
    occupancyPct > 100;

  if (input.status === "published" && operatingProfileInvalid) {
    return { ok: false, error: "Set parking spaces and occupancy before publishing." };
  }

  // Unpublishing re-opens editing of yield/min-ticket/options while pending
  // interests still reference the published terms — resolve them first.
  if (existing.status === "published" && input.status === "draft") {
    const [pending] = await db
      .select({ id: interests.id })
      .from(interests)
      .where(and(eq(interests.assetId, input.assetId), eq(interests.status, "pending")))
      .limit(1);
    if (pending) {
      return { ok: false, error: "Resolve pending interests before unpublishing." };
    }
  }

  const changed = await db.transaction(async (tx) => {
    // Compare-and-set against the status that was validated above. If another
    // admin closed or otherwise changed the asset first, this stale request
    // must not overwrite that newer state.
    const claimed = await tx
      .update(assets)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(assets.id, input.assetId), eq(assets.status, existing.status)))
      .returning({ id: assets.id });

    if (claimed.length === 0) {
      return false;
    }

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.status_changed",
      entityType: "asset",
      entityId: input.assetId,
      payload: { from: existing.status, to: input.status }
    });

    return true;
  });

  if (!changed) {
    return {
      ok: false,
      error: "This opportunity changed while you were updating it. Refresh and try again."
    };
  }

  revalidatePath("/admin/assets");
  revalidatePath("/opportunities");
  return { ok: true };
}

export async function updateAssetImages(input: {
  assetId: string;
  coverImageUrl: string;
  galleryImageUrlsText: string;
  coverImageCaption: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let userId: string;
  try {
    const staff = await requireSuperAdmin();
    userId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const cover = input.coverImageUrl.trim();
  if (cover && !isSafeHttpUrl(cover)) {
    return { ok: false, error: "Cover image must be an https URL or a site path starting with /." };
  }

  const gallery = input.galleryImageUrlsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const url of gallery) {
    if (!isSafeHttpUrl(url)) {
      return { ok: false, error: `Invalid gallery URL: ${url}` };
    }
  }
  if (gallery.length > 8) {
    return { ok: false, error: "At most 8 gallery images." };
  }

  const caption = input.coverImageCaption.trim() || null;

  const [existing] = await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
  if (!existing) return { ok: false, error: "Asset not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({
        coverImageUrl: cover || null,
        galleryImageUrls: gallery,
        coverImageCaption: caption,
        updatedAt: new Date()
      })
      .where(eq(assets.id, input.assetId));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.images_updated",
      entityType: "asset",
      entityId: input.assetId,
      payload: {
        coverImageUrl: cover || null,
        galleryCount: gallery.length,
        coverImageCaption: caption
      }
    });
  });

  revalidatePath("/admin/assets");
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${existing.slug}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateAssetCapacity(input: {
  assetId: string;
  advisoryCapacityEur: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let userId: string;
  try {
    const staff = await requireSuperAdmin();
    userId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = parseAdvisoryCapacityInput(input.advisoryCapacityEur);
  if (!parsed.ok) return parsed;

  const [existing] = await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1);
  if (!existing) return { ok: false, error: "Asset not found." };

  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({
        advisoryCapacityEur: parsed.value,
        updatedAt: new Date()
      })
      .where(eq(assets.id, input.assetId));

    await tx.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.capacity_updated",
      entityType: "asset",
      entityId: input.assetId,
      payload: {
        from: existing.advisoryCapacityEur,
        to: parsed.value
      }
    });
  });

  revalidatePath("/admin/assets");
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${existing.slug}`);
  revalidatePath("/");
  return { ok: true };
}


export async function createAsset(
  input: AssetFormInput
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  let userId: string;
  try {
    const staff = await requireSuperAdmin();
    userId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = validateAssetForm(input);
  if (!parsed.ok) return parsed;

  let inserted: { id: string };
  try {
    inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(assets)
        .values({ ...parsed.values, status: "draft" })
        .returning({ id: assets.id });

      // The draft and its audit event are one authoring operation. A failed
      // audit insert must not leave an unaudited investment opportunity.
      await tx.insert(auditEvents).values({
        actorUserId: userId,
        action: "asset.created",
        entityType: "asset",
        entityId: row.id,
        payload: { slug: parsed.values.slug, name: parsed.values.name }
      });

      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "An opportunity with a similar name already exists." };
    }
    throw error;
  }

  revalidatePath("/admin/assets");
  revalidatePath("/opportunities");
  revalidatePath("/");
  return { ok: true, assetId: inserted!.id };
}

export async function updateDraftAsset(input: {
  assetId: string;
  form: AssetFormInput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let userId: string;
  try {
    const staff = await requireSuperAdmin();
    userId = staff.user.id;
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const [existing] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, input.assetId))
    .limit(1);
  if (!existing) return { ok: false, error: "Asset not found." };
  if (existing.status !== "draft") {
    return { ok: false, error: "Only draft opportunities can be edited." };
  }

  const parsed = validateAssetForm(input.form);
  if (!parsed.ok) return parsed;

  // Slug is identity (consumer URLs); a rename does not rewrite it.
  const { slug: _slug, ...updateValues } = parsed.values;
  const updated = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(assets)
      .set({ ...updateValues, updatedAt: new Date() })
      .where(and(eq(assets.id, input.assetId), eq(assets.status, "draft")))
      .returning({ id: assets.id });
    if (claimed.length === 0) {
      return false;
    }

    // Keep the guarded draft update and its audit record in one transaction.
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      action: "asset.updated",
      entityType: "asset",
      entityId: input.assetId,
      payload: { slug: existing.slug, name: parsed.values.name }
    });

    return true;
  });
  if (!updated) {
    return { ok: false, error: "Only draft opportunities can be edited." };
  }

  revalidatePath("/admin/assets");
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${existing.slug}`);
  revalidatePath("/");
  return { ok: true };
}
