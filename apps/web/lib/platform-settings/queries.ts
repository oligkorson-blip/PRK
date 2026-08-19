import { eq } from "drizzle-orm";
import { db, platformSettings } from "@/lib/db";
import {
  COMMUNITY_SPACES_SETTING,
  POOL_INVESTMENTS_SETTING,
  type PlatformSettingKey
} from "./keys";

export type PlatformSettingState = {
  enabled: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

async function getPlatformSetting(key: PlatformSettingKey): Promise<PlatformSettingState> {
  const [row] = await db
    .select({
      enabled: platformSettings.enabled,
      updatedAt: platformSettings.updatedAt,
      updatedBy: platformSettings.updatedBy
    })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);

  return {
    enabled: row?.enabled ?? false,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null
  };
}

async function isPlatformSettingEnabled(key: PlatformSettingKey): Promise<boolean> {
  const [row] = await db
    .select({ enabled: platformSettings.enabled })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);

  return row?.enabled ?? false;
}

export function isPoolInvestmentsEnabled(): Promise<boolean> {
  return isPlatformSettingEnabled(POOL_INVESTMENTS_SETTING);
}

export function getPoolInvestmentsSetting(): Promise<PlatformSettingState> {
  return getPlatformSetting(POOL_INVESTMENTS_SETTING);
}

export function isCommunitySpacesEnabled(): Promise<boolean> {
  return isPlatformSettingEnabled(COMMUNITY_SPACES_SETTING);
}
