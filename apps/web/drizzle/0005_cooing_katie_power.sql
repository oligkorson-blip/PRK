CREATE TYPE "public"."staff_role" AS ENUM('super_admin', 'agent');--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "assigned_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_assigned_agent_id_staff_profiles_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;