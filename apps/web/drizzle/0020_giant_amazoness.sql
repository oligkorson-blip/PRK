CREATE TABLE "interest_confirmation_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interest_id" uuid NOT NULL,
	"approved_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interest_confirmation_approvals" ADD CONSTRAINT "interest_confirmation_approvals_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_confirmation_approvals" ADD CONSTRAINT "interest_confirmation_approvals_approved_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_confirmation_approvals_interest_uidx" ON "interest_confirmation_approvals" USING btree ("interest_id");