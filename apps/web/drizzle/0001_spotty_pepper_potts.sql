CREATE TYPE "public"."holding_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."interest_status" AS ENUM('pending', 'confirmed', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"amount_eur" integer NOT NULL,
	"target_yield_pct" numeric(5, 2) NOT NULL,
	"status" "holding_status" DEFAULT 'active' NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_interest_id_unique" UNIQUE("interest_id")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"amount_eur" integer NOT NULL,
	"note" text,
	"status" "interest_status" DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Partial unique index: at most one pending interest per investor/asset.
-- Drizzle-kit cannot emit partial unique indexes from the schema DSL, so this
-- was added by hand; keep it in sync with lib/db/schema.ts if interests changes.
CREATE UNIQUE INDEX "interests_one_pending_uidx" ON "interests" USING btree ("investor_id","asset_id") WHERE "interests"."status" = 'pending';