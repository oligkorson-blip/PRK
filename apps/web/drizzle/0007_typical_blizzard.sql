CREATE TYPE "public"."lead_call_outcome" AS ENUM('no_answer', 'reached', 'interested', 'not_interested', 'callback', 'wrong_number', 'other');--> statement-breakpoint
CREATE TABLE "lead_call_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "lead_call_outcome" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_call_attempts" ADD CONSTRAINT "lead_call_attempts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_call_attempts" ADD CONSTRAINT "lead_call_attempts_agent_id_staff_profiles_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."staff_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_call_attempts_lead_id_called_at_idx" ON "lead_call_attempts" USING btree ("lead_id","called_at" DESC NULLS LAST);