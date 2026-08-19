CREATE UNIQUE INDEX "leads_list_email_lower_uidx" ON "leads" USING btree ("list_id",lower("email"));--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN "last_invite_url";