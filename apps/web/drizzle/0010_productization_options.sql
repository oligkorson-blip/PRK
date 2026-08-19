-- Productization rev 5: allocation options, provenance, operator display, interest optionId
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "visitors_per_day" integer;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "visitors_provenance" text DEFAULT 'withheld' NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "available_spaces" integer;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "annual_revenue_eur" integer;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "revenue_provenance" text DEFAULT 'withheld' NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "commercial_term_ids" jsonb DEFAULT '["triple_net","contractual_monthly_rent","indexation_floor","parkwise_protections","flexible_term"]'::jsonb NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "investment_options" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "operator_display" jsonb;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "site_type" text;
ALTER TABLE "interests" ADD COLUMN IF NOT EXISTS "option_id" text;
