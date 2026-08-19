CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "platform_settings" ("key", "enabled", "updated_by")
VALUES ('pool_investments_enabled', false, 'system')
ON CONFLICT ("key") DO NOTHING;
