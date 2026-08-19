ALTER TABLE "investors" ADD COLUMN "pool_investments_enabled" boolean DEFAULT false NOT NULL;
-- Preserve access for existing converted investors; newly created investors keep the safe default.
UPDATE "investors"
SET "pool_investments_enabled" = true
WHERE "onboarding_status" = 'completed'
  AND "account_status" = 'active';
