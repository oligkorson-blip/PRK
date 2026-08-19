CREATE TYPE "public"."document_owner_type" AS ENUM('asset', 'holding', 'platform');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "document_owner_type" NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"r2_key" text NOT NULL,
	"content_type" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
