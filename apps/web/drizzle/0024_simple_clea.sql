CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invite_tokens_investor_id_idx" ON "invite_tokens" USING btree ("investor_id");