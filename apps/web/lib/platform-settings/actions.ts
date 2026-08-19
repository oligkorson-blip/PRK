"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/investor";
import { auditEvents, db, platformSettings } from "@/lib/db";
import {
  COMMUNITY_SPACES_SETTING,
  POOL_INVESTMENTS_SETTING,
  type PlatformSettingKey
} from "./keys";

type RevalidationTarget = {
  path: string;
  type?: "layout" | "page";
};

function parseEnabled(formData: FormData): boolean {
  const value = formData.get("enabled");
  if (value !== "true" && value !== "false") {
    throw new Error("INVALID_PLATFORM_SETTING_VALUE");
  }
  return value === "true";
}

async function setPlatformSetting(
  key: PlatformSettingKey,
  formData: FormData,
  revalidationTargets: readonly RevalidationTarget[]
): Promise<void> {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }

  const enabled = parseEnabled(formData);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(platformSettings)
      .values({
        key,
        enabled,
        updatedBy: admin.id,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: {
          enabled,
          updatedBy: admin.id,
          updatedAt: now
        }
      });

    await tx.insert(auditEvents).values({
      actorUserId: admin.id,
      action: "platform_setting.updated",
      entityType: "platform_setting",
      payload: { key, enabled }
    });
  });

  for (const target of revalidationTargets) {
    if (target.type) {
      revalidatePath(target.path, target.type);
    } else {
      revalidatePath(target.path);
    }
  }
}

export async function setPoolInvestmentsEnabled(formData: FormData): Promise<void> {
  await setPlatformSetting(
    POOL_INVESTMENTS_SETTING,
    formData,
    [
      { path: "/admin/platform" },
      { path: "/", type: "layout" },
      { path: "/opportunities", type: "layout" }
    ]
  );
}

export async function setCommunitySpacesEnabled(formData: FormData): Promise<void> {
  await setPlatformSetting(
    COMMUNITY_SPACES_SETTING,
    formData,
    [
      { path: "/admin/platform" },
      { path: "/spaces" },
      { path: "/list-a-space" },
      { path: "/sitemap.xml" }
    ]
  );
}
