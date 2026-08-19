CREATE TABLE "distribution_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"subject_key" text NOT NULL,
	"approved_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "distribution_approvals" ADD CONSTRAINT "distribution_approvals_approved_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_approvals_action_subject_uidx" ON "distribution_approvals" USING btree ("action","subject_key");