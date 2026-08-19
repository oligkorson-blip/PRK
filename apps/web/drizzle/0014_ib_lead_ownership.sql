CREATE TYPE "public"."lead_assignment_action" AS ENUM('assign_ib', 'assign_agent', 'reassign_ib', 'reassign_agent', 'remove_agent', 'remove_all', 'return_to_ib_queue');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'unqualified', 'duplicate', 'converted');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'ib' BEFORE 'agent';--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"actor_staff_id" uuid,
	"action" "lead_assignment_action" NOT NULL,
	"from_ib_id" uuid,
	"to_ib_id" uuid,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "ib_id" uuid;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "original_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "original_ib_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "status" "lead_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ib_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "ib_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_actor_staff_id_staff_profiles_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_ib_id_staff_profiles_id_fk" FOREIGN KEY ("from_ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_ib_id_staff_profiles_id_fk" FOREIGN KEY ("to_ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_agent_id_staff_profiles_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_agent_id_staff_profiles_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_ib_id_staff_profiles_id_fk" FOREIGN KEY ("ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_original_agent_id_staff_profiles_id_fk" FOREIGN KEY ("original_agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_original_ib_id_staff_profiles_id_fk" FOREIGN KEY ("original_ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_ib_id_staff_profiles_id_fk" FOREIGN KEY ("ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("assigned_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_ib_id_staff_profiles_id_fk" FOREIGN KEY ("ib_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_assignments_lead_id_idx" ON "lead_assignments" USING btree ("lead_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_ib_id_idx" ON "leads" USING btree ("ib_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_requires_ib" CHECK (assigned_agent_id IS NULL OR ib_id IS NOT NULL);
