CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('started', 'completed');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"operator" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"country" text NOT NULL,
	"target_yield_pct" numeric(5, 2) NOT NULL,
	"tier" text NOT NULL,
	"min_ticket_eur" integer NOT NULL,
	"spaces" integer NOT NULL,
	"occupancy_pct" numeric(5, 2) NOT NULL,
	"lease_label" text NOT NULL,
	"blurb" text NOT NULL,
	"status" "asset_status" DEFAULT 'draft' NOT NULL,
	"advisory_capacity_eur" integer,
	"art_variant" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_clerk_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"phone" text,
	"onboarding_status" "onboarding_status" DEFAULT 'started' NOT NULL,
	"account_status" "account_status" DEFAULT 'active' NOT NULL,
	"eligibility_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"terms_accepted_at" timestamp with time zone,
	"risk_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investors_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assets_slug_uidx" ON "assets" USING btree ("slug");