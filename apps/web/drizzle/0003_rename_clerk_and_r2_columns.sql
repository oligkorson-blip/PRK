ALTER TABLE "audit_events" RENAME COLUMN "actor_clerk_id" TO "actor_user_id";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "r2_key" TO "storage_key";--> statement-breakpoint
ALTER TABLE "investors" RENAME COLUMN "clerk_user_id" TO "auth_user_id";--> statement-breakpoint
ALTER TABLE "investors" DROP CONSTRAINT "investors_clerk_user_id_unique";--> statement-breakpoint
ALTER TABLE "investors" ADD CONSTRAINT "investors_auth_user_id_unique" UNIQUE("auth_user_id");