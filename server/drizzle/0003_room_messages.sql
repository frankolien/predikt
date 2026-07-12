DROP TABLE IF EXISTS "pool_messages" CASCADE;--> statement-breakpoint
CREATE TABLE "room_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"room" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_messages_room_idx" ON "room_messages" USING btree ("room","created_at");