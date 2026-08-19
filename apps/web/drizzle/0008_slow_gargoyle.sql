CREATE TYPE "public"."enrichment_source" AS ENUM('api', 'local', 'none');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'ok', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "user_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"ua_browser" text,
	"ua_os" text,
	"ua_device" text,
	"country_code" text,
	"country_name" text,
	"region" text,
	"city" text,
	"timezone" text,
	"isp" text,
	"org" text,
	"is_proxy" boolean,
	"is_vpn" boolean,
	"is_datacenter" boolean,
	"enrichment_status" "enrichment_status" DEFAULT 'pending' NOT NULL,
	"enrichment_source" "enrichment_source" DEFAULT 'none' NOT NULL,
	"enrichment_raw" jsonb,
	"session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_access_events_user_occurred_idx" ON "user_access_events" USING btree ("auth_user_id","occurred_at");