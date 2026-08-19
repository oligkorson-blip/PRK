CREATE TABLE "investor_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"author_staff_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_notes" ADD CONSTRAINT "investor_notes_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_notes" ADD CONSTRAINT "investor_notes_author_staff_id_staff_profiles_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_notes_investor_id_idx" ON "investor_notes" USING btree ("investor_id");