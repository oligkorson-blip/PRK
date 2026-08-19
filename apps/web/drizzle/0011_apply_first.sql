-- Apply-first access model
ALTER TYPE "account_status" ADD VALUE IF NOT EXISTS 'pending_access';
DO $$ BEGIN
  CREATE TYPE "kyc_status" AS ENUM ('not_started', 'submitted', 'under_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "application_account_type" AS ENUM ('individual', 'company');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "application_status" AS ENUM ('submitted', 'contacted', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "investors" ALTER COLUMN "auth_user_id" DROP NOT NULL;
ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "kyc_status" "kyc_status" DEFAULT 'not_started' NOT NULL;
ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "kyc_reject_reason" text;
ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "account_type" "application_account_type" DEFAULT 'individual';
ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "last_invite_url" text;

CREATE UNIQUE INDEX IF NOT EXISTS "investors_email_lower_uidx" ON "investors" (lower("email"));

CREATE TABLE IF NOT EXISTS "investor_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investor_id" uuid NOT NULL REFERENCES "investors"("id"),
  "account_type" "application_account_type" NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text NOT NULL,
  "country_of_residence" text NOT NULL,
  "company_legal_name" text,
  "country_of_incorporation" text,
  "investment_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "terms_accepted_at" timestamptz NOT NULL,
  "risk_accepted_at" timestamptz NOT NULL,
  "status" "application_status" DEFAULT 'submitted' NOT NULL,
  "ops_note" text,
  "lead_id" uuid REFERENCES "leads"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invite_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investor_id" uuid NOT NULL REFERENCES "investors"("id"),
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TYPE "document_owner_type" ADD VALUE IF NOT EXISTS 'investor';
