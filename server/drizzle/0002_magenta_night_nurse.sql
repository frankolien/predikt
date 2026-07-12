CREATE TABLE "pool_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pool_messages" ADD CONSTRAINT "pool_messages_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_messages" ADD CONSTRAINT "pool_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_messages_pool_idx" ON "pool_messages" USING btree ("pool_id","created_at");