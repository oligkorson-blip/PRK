DO $$
BEGIN
  CREATE TYPE "community_space_type" AS ENUM ('residential', 'ev_station', 'garage', 'private_lot');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "community_space_status" AS ENUM ('draft', 'published', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "community_space_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "host_label" text DEFAULT 'Private host' NOT NULL,
  "space_type" "community_space_type" NOT NULL,
  "city" text NOT NULL,
  "district" text DEFAULT '' NOT NULL,
  "country" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "access_notes" text DEFAULT '' NOT NULL,
  "monthly_price_eur" integer NOT NULL,
  "features" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "community_space_status" DEFAULT 'draft' NOT NULL,
  "verified_at" timestamp with time zone,
  "created_by" text NOT NULL,
  "updated_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_space_listings_slug_uidx"
  ON "community_space_listings" ("slug");

CREATE INDEX IF NOT EXISTS "community_space_listings_status_city_idx"
  ON "community_space_listings" ("status", "city");

INSERT INTO "platform_settings" ("key", "enabled", "updated_by")
VALUES ('community_spaces_enabled', true, 'system')
ON CONFLICT ("key") DO NOTHING;
