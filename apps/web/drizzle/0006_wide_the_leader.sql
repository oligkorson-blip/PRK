CREATE TABLE "lead_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_source" text DEFAULT '' NOT NULL,
	"created_by_staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"source" text NOT NULL,
	"source_detail" text,
	"notes" text,
	"assigned_agent_id" uuid,
	"investor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_created_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_agent_id_staff_profiles_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_investor_id_uidx" ON "leads" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "leads_email_lower_idx" ON "leads" USING btree (lower("email"));