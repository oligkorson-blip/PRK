CREATE TYPE "public"."kyc_check_result" AS ENUM('clear', 'review', 'rejected');--> statement-breakpoint
CREATE TABLE "kyc_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"result" "kyc_check_result" NOT NULL,
	"screening_note" text NOT NULL,
	"source_of_funds_note" text,
	"reviewed_by_staff_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "pep_declaration" boolean;--> statement-breakpoint
ALTER TABLE "kyc_checks" ADD CONSTRAINT "kyc_checks_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_checks" ADD CONSTRAINT "kyc_checks_reviewed_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_checks_investor_id_reviewed_at_idx" ON "kyc_checks" USING btree ("investor_id","reviewed_at" DESC NULLS LAST);