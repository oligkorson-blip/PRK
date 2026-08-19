-- Distributions ledger for investor payment history
DO $$ BEGIN
  CREATE TYPE "distribution_status" AS ENUM ('scheduled', 'paid', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "distribution_type" AS ENUM ('income', 'return_of_capital', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "distributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "investor_id" uuid NOT NULL REFERENCES "investors"("id"),
  "holding_id" uuid NOT NULL REFERENCES "holdings"("id"),
  "amount_eur" integer NOT NULL,
  "type" "distribution_type" DEFAULT 'income' NOT NULL,
  "status" "distribution_status" DEFAULT 'scheduled' NOT NULL,
  "period_label" text,
  "paid_at" timestamptz,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "distributions_investor_paid_idx"
  ON "distributions" ("investor_id", "paid_at");
