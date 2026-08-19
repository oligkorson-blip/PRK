CREATE TYPE "public"."contract_state" AS ENUM('ready_to_review', 'summary_viewed', 'agreement_viewed', 'investor_signed', 'counter_signature_pending', 'effective', 'signed_documents_available', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."contract_signer_role" AS ENUM('investor', 'legal_signer');--> statement-breakpoint
CREATE TYPE "public"."contract_signature_status" AS ENUM('pending', 'signed', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."contract_actor_type" AS ENUM('investor', 'legal_signer', 'staff', 'provider', 'system');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"version" text NOT NULL,
	"state" "public"."contract_state" DEFAULT 'ready_to_review' NOT NULL,
	"summary_document_id" uuid,
	"agreement_document_id" uuid,
	"signed_document_id" uuid,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id"),
	CONSTRAINT "contracts_summary_document_id_documents_id_fk" FOREIGN KEY ("summary_document_id") REFERENCES "public"."documents"("id"),
	CONSTRAINT "contracts_agreement_document_id_documents_id_fk" FOREIGN KEY ("agreement_document_id") REFERENCES "public"."documents"("id"),
	CONSTRAINT "contracts_signed_document_id_documents_id_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."documents"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_investor_version_uidx" ON "contracts" USING btree ("investor_id", "version");--> statement-breakpoint
CREATE INDEX "contracts_investor_state_idx" ON "contracts" USING btree ("investor_id", "state");--> statement-breakpoint
CREATE TABLE "contract_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"role" "public"."contract_signer_role" NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"status" "public"."contract_signature_status" DEFAULT 'pending' NOT NULL,
	"provider_signer_id" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_signers_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signers_contract_role_uidx" ON "contract_signers" USING btree ("contract_id", "role");--> statement-breakpoint
CREATE INDEX "contract_signers_contract_id_idx" ON "contract_signers" USING btree ("contract_id");--> statement-breakpoint
CREATE TABLE "contract_signature_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"signer_role" "public"."contract_signer_role" NOT NULL,
	"status" "public"."contract_signature_status" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "contract_signature_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signature_events_provider_key_uidx" ON "contract_signature_events" USING btree ("provider", "provider_event_id", "contract_id", "contract_version");--> statement-breakpoint
CREATE INDEX "contract_signature_events_contract_id_idx" ON "contract_signature_events" USING btree ("contract_id", "occurred_at");--> statement-breakpoint
CREATE TABLE "contract_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"from_state" "public"."contract_state",
	"to_state" "public"."contract_state" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_type" "public"."contract_actor_type" NOT NULL,
	"source" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "contract_transitions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "contract_transitions_contract_id_idx" ON "contract_transitions" USING btree ("contract_id", "occurred_at");
