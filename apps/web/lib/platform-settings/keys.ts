export const POOL_INVESTMENTS_SETTING = "pool_investments_enabled" as const;
export const COMMUNITY_SPACES_SETTING = "community_spaces_enabled" as const;

export type PlatformSettingKey =
  | typeof POOL_INVESTMENTS_SETTING
  | typeof COMMUNITY_SPACES_SETTING;
