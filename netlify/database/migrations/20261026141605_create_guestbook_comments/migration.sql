CREATE TABLE "guestbook_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"class" text NOT NULL,
	"topic" text NOT NULL,
	"message" text NOT NULL,
	"owner_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
