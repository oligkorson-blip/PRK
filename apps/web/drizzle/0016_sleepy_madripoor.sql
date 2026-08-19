DROP INDEX "interests_one_pending_uidx";--> statement-breakpoint
ALTER TABLE "distributions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE INDEX "holdings_investor_id_idx" ON "holdings" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_lists_name_uidx" ON "lead_lists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "interests_investor_id_idx" ON "interests" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_applications_investor_id_idx" ON "investor_applications" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "distributions_holding_id_idx" ON "distributions" USING btree ("holding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "distributions_idempotency_key_uidx" ON "distributions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "investors_assigned_agent_id_idx" ON "investors" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "investors_ib_id_idx" ON "investors" USING btree ("ib_id");--> statement-breakpoint
CREATE INDEX "leads_assigned_agent_id_idx" ON "leads" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "leads_list_id_idx" ON "leads" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "staff_profiles_ib_id_idx" ON "staff_profiles" USING btree ("ib_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interests_one_pending_uidx" ON "interests" USING btree ("investor_id","asset_id") WHERE "interests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_amount_positive" CHECK ("holdings"."amount_eur" > 0);--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_amount_positive" CHECK ("interests"."amount_eur" > 0);--> statement-breakpoint
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_amount_positive" CHECK ("distributions"."amount_eur" > 0);
