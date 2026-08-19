-- Optional consumer imagery for published assets
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "cover_image_url" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "gallery_image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
