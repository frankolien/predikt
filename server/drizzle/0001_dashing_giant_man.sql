CREATE TABLE "consumed_deposits" (
	"tx_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
