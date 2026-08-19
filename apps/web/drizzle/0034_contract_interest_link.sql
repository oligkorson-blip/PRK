ALTER TABLE "contracts" ADD COLUMN "interest_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_interest_id_uidx" ON "contracts" USING btree ("interest_id");
